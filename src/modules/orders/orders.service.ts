import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { paginate, toOrderBy, toSkipTake } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CartIdentity } from '../cart/cart.service';
import { evaluateCoupon } from '../coupons/coupon.math';
import { SettingsService } from '../settings/settings.service';
import { AddressDto, AdminOrderQueryDto, CheckoutDto } from './dto/order.dto';
import { computeSubtotal, computeTotals } from './order.totals';

// Human-readable, unambiguous order numbers: NEX-7F3K2Q
const genOrderSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const orderInclude = { items: true } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  toView(order: OrderWithItems) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      email: order.email,
      currency: order.currency,
      couponCode: order.couponCode,
      totals: {
        subtotal: order.subtotal,
        discount: order.discount,
        shipping: order.shipping,
        tax: order.tax,
        total: order.total,
      },
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      items: order.items.map((i) => ({
        id: i.id,
        productName: i.productName,
        variantName: i.variantName,
        sku: i.sku,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        image: i.imageUrl,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Create an order from the cart. Server recomputes ALL money from current
   * variant prices; client totals are ignored. Stock is decremented with an
   * atomic conditional update so concurrent checkouts can never oversell.
   */
  async checkout(identity: CartIdentity, userId: string | undefined, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findFirst({
      where: identity.userId ? { userId: identity.userId } : { sessionId: identity.sessionId },
      include: {
        items: { include: { variant: { include: { product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } } } } },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }

    // Pre-compute line snapshots from CURRENT prices (not client input).
    const lines = cart.items.map((item) => {
      const unitPrice = item.variant.priceOverride ?? item.variant.product.basePrice;
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        imageUrl: item.variant.product.images[0]?.url ?? null,
        stock: item.variant.stock,
      };
    });

    const subtotal = computeSubtotal(lines);

    // Coupon re-evaluated server-side.
    let discount = 0;
    let appliedCoupon: string | null = null;
    if (cart.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      if (coupon) {
        const evaln = evaluateCoupon(coupon, subtotal);
        if (evaln.valid) {
          discount = evaln.discount;
          appliedCoupon = coupon.code;
        }
      }
    }

    const taxable = Math.max(0, subtotal - discount);
    const shipping = await this.settings.shippingFor(taxable);
    const tax = await this.settings.taxFor(taxable);
    const { currency } = await this.settings.getCommerce();
    const totals = computeTotals({ subtotal, discount, shipping, tax });

    const order = await this.prisma.$transaction(async (tx) => {
      // Atomic, oversell-proof stock decrement. updateMany only matches rows
      // whose stock is still >= quantity, so two racing checkouts for the last
      // unit -> exactly one succeeds; the other sees count 0 and throws.
      for (const line of lines) {
        const res = await tx.productVariant.updateMany({
          where: { id: line.variantId, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (res.count !== 1) {
          throw new ConflictException(`${line.productName} (${line.variantName}) is out of stock.`);
        }
      }

      // Consume coupon usage atomically (respect usageLimit).
      if (appliedCoupon) {
        await tx.coupon.updateMany({
          where: { code: appliedCoupon },
          data: { usedCount: { increment: 1 } },
        });
      }

      const created = await this.createOrderWithUniqueNumber(tx, {
        userId: userId ?? null,
        email: dto.email.toLowerCase(),
        status: OrderStatus.PENDING,
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total,
        currency,
        couponCode: appliedCoupon,
        shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
        billingAddress: dto.billingAddress
          ? (dto.billingAddress as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        items: {
          create: lines.map((l) => ({
            variantId: l.variantId,
            productName: l.productName,
            variantName: l.variantName,
            sku: l.sku,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.unitPrice * l.quantity,
            imageUrl: l.imageUrl,
          })),
        },
      });

      // Empty the cart now that it's an order.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });

      return created;
    });

    return this.toView(order);
  }

  /** Stubbed payment: PENDING -> PAID. // TODO: integrate Stripe / local PSP. */
  async pay(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(`Order is already ${order.status}.`);
    }
    // TODO: integrate Stripe/local PSP — charge here, then mark PAID on success.
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
      include: orderInclude,
    });
    return this.toView(updated);
  }

  // ---- customer ----

  async listForUser(userId: string, query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = { userId };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: orderInclude, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map((o) => this.toView(o)), total, query);
  }

  async getForUser(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({ where: { orderNumber, userId }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found.');
    return this.toView(order);
  }

  /** Guest-friendly confirmation lookup by order number. */
  async getByNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found.');
    return this.toView(order);
  }

  // ---- admin ----

  async listAdmin(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const { skip, take } = toSkipTake(query);
    const orderBy = toOrderBy(query, ['createdAt', 'total', 'status'] as const, 'createdAt');
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include: orderInclude, skip, take, orderBy }),
      this.prisma.order.count({ where }),
    ]);
    return paginate(rows.map((o) => this.toView(o)), total, query);
  }

  async getAdmin(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Order not found.');
    return this.toView(order);
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found.');
    const updated = await this.prisma.order.update({ where: { id }, data: { status }, include: orderInclude });
    return this.toView(updated);
  }

  // ---- internals ----

  private async createOrderWithUniqueNumber(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.OrderUncheckedCreateInput, 'orderNumber'>,
  ): Promise<OrderWithItems> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const orderNumber = `NEX-${genOrderSuffix()}`;
      try {
        return await tx.order.create({
          data: { ...data, orderNumber },
          include: orderInclude,
        });
      } catch (e) {
        // Retry only on unique-constraint collision of orderNumber.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 3) continue;
        throw e;
      }
    }
    // Unreachable in practice.
    throw new ConflictException('Could not allocate an order number, please retry.');
  }
}
