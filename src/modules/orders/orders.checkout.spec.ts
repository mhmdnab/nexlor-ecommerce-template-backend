import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Proves the checkout stock guard: the conditional decrement (updateMany with
 * `stock: { gte: qty }`) means two checkouts racing for the last unit can never
 * push stock negative — exactly one wins, the other gets a ConflictException.
 *
 * We model Prisma with a tiny in-memory fake whose updateMany enforces the same
 * atomic condition the real database does.
 */
function makeFakePrisma(initialStock: number) {
  const store = { stock: initialStock };
  let orderSeq = 0;

  const variant = {
    id: 'v1',
    priceOverride: null,
    stock: initialStock,
    product: { name: 'Test Tee', slug: 'test-tee', basePrice: 2000, images: [{ url: 'x.jpg' }] },
    name: 'M',
    sku: 'TEE-M',
  };

  const cart = {
    id: 'cart1',
    couponCode: null,
    items: [{ variantId: 'v1', quantity: 1, variant }],
  };

  return {
    getStock: () => store.stock,
    cart: {
      findFirst: jest.fn().mockResolvedValue(cart),
      update: jest.fn().mockResolvedValue({}),
    },
    coupon: { findUnique: jest.fn().mockResolvedValue(null) },
    cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    order: {
      create: jest.fn(),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        productVariant: {
          updateMany: async ({ where, data }: any) => {
            // Atomic conditional decrement, exactly like Postgres.
            if (store.stock >= where.stock.gte) {
              store.stock += data.stock.decrement * -1;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        coupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        cart: { update: jest.fn().mockResolvedValue({}) },
        order: {
          create: async ({ data }: any) => ({
            id: `o${++orderSeq}`,
            orderNumber: `NEX-TEST${orderSeq}`,
            status: 'PENDING',
            email: data.email,
            currency: 'USD',
            couponCode: null,
            subtotal: data.subtotal,
            discount: data.discount,
            shipping: data.shipping,
            tax: data.tax,
            total: data.total,
            shippingAddress: data.shippingAddress,
            billingAddress: null,
            items: data.items.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };
      return fn(tx);
    },
  };
}

const fakeSettings = {
  shippingFor: jest.fn().mockResolvedValue(0),
  taxFor: jest.fn().mockResolvedValue(0),
  getCommerce: jest.fn().mockResolvedValue({ currency: 'USD', taxRatePercent: 0, taxInclusive: false }),
};

const checkoutDto = {
  email: 'buyer@example.com',
  shippingAddress: {
    fullName: 'Buyer', line1: '1 St', city: 'Town', postalCode: '00000', country: 'US',
  },
};

describe('OrdersService.checkout — stock safety', () => {
  it('lets exactly one checkout succeed for the last unit; stock never goes negative', async () => {
    const prisma = makeFakePrisma(1);
    const service = new OrdersService(prisma as any, fakeSettings as any);

    const results = await Promise.allSettled([
      service.checkout({ sessionId: 's1' }, undefined, checkoutDto as any),
      service.checkout({ sessionId: 's1' }, undefined, checkoutDto as any),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(prisma.getStock()).toBe(0);
    expect(prisma.getStock()).toBeGreaterThanOrEqual(0);
  });

  it('decrements stock once for a single successful checkout', async () => {
    const prisma = makeFakePrisma(5);
    const service = new OrdersService(prisma as any, fakeSettings as any);

    const order = await service.checkout({ sessionId: 's1' }, undefined, checkoutDto as any);

    expect(order.orderNumber).toMatch(/^NEX-/);
    expect(order.totals.subtotal).toBe(2000);
    expect(prisma.getStock()).toBe(4);
  });
});
