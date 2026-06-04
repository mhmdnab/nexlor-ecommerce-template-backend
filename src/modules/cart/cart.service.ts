import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluateCoupon } from '../coupons/coupon.math';
import { SettingsService } from '../settings/settings.service';

export interface CartIdentity {
  userId?: string;
  sessionId?: string;
}

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      variant: { include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private whereForIdentity(identity: CartIdentity): Prisma.CartWhereInput {
    if (identity.userId) return { userId: identity.userId };
    if (identity.sessionId) return { sessionId: identity.sessionId };
    throw new BadRequestException('No cart identity (missing session).');
  }

  async getOrCreate(identity: CartIdentity): Promise<CartWithItems> {
    const existing = await this.prisma.cart.findFirst({
      where: this.whereForIdentity(identity),
      include: cartInclude,
    });
    if (existing) return existing;
    return this.prisma.cart.create({
      data: { userId: identity.userId ?? null, sessionId: identity.userId ? null : identity.sessionId ?? null },
      include: cartInclude,
    });
  }

  /** Build the full cart view with money math. Coupon + shipping + tax. */
  async view(identity: CartIdentity) {
    const cart = await this.getOrCreate(identity);
    return this.toView(cart);
  }

  private async toView(cart: CartWithItems) {
    const lines = cart.items.map((item) => {
      const unitPrice = item.variant.priceOverride ?? item.variant.product.basePrice;
      return {
        id: item.id,
        variantId: item.variantId,
        productSlug: item.variant.product.slug,
        productName: item.variant.product.name,
        variantName: item.variant.name,
        sku: item.variant.sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal: unitPrice * item.quantity,
        image: item.variant.product.images[0]?.url ?? null,
        stock: item.variant.stock,
        inStock: item.variant.stock >= item.quantity,
      };
    });

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    let discount = 0;
    let coupon: { code: string; valid: boolean; reason?: string } | null = null;
    if (cart.couponCode) {
      const c = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      if (c) {
        const evaln = evaluateCoupon(c, subtotal);
        discount = evaln.discount;
        coupon = { code: c.code, valid: evaln.valid, reason: evaln.reason };
      } else {
        coupon = { code: cart.couponCode, valid: false, reason: 'Coupon no longer exists.' };
      }
    }

    const taxable = Math.max(0, subtotal - discount);
    const shipping = lines.length ? await this.settings.shippingFor(taxable) : 0;
    const tax = await this.settings.taxFor(taxable);
    const total = taxable + shipping + tax;
    const { currency } = await this.settings.getCommerce();

    return {
      id: cart.id,
      items: lines,
      itemCount: lines.reduce((s, l) => s + l.quantity, 0),
      coupon,
      currency,
      totals: { subtotal, discount, shipping, tax, total },
    };
  }

  async addItem(identity: CartIdentity, variantId: string, quantity: number) {
    if (quantity < 1) throw new BadRequestException('Quantity must be at least 1.');
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found.');

    const cart = await this.getOrCreate(identity);
    const existingItem = cart.items.find((i) => i.variantId === variantId);
    const desiredQty = (existingItem?.quantity ?? 0) + quantity;
    if (desiredQty > variant.stock) {
      throw new BadRequestException(`Only ${variant.stock} in stock.`);
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity },
      update: { quantity: desiredQty },
    });
    return this.view(identity);
  }

  async updateItem(identity: CartIdentity, itemId: string, quantity: number) {
    const cart = await this.getOrCreate(identity);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found.');

    if (quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      if (quantity > item.variant.stock) throw new BadRequestException(`Only ${item.variant.stock} in stock.`);
      await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    }
    return this.view(identity);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const cart = await this.getOrCreate(identity);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Cart item not found.');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.view(identity);
  }

  async applyCoupon(identity: CartIdentity, code: string) {
    const cart = await this.getOrCreate(identity);
    const normalized = code.toUpperCase().trim();
    const view = await this.toView(cart);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalized } });
    if (!coupon) throw new BadRequestException('Coupon not found.');
    const evaln = evaluateCoupon(coupon, view.totals.subtotal);
    if (!evaln.valid) throw new BadRequestException(evaln.reason ?? 'Coupon is not valid.');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: normalized } });
    return this.view(identity);
  }

  async removeCoupon(identity: CartIdentity) {
    const cart = await this.getOrCreate(identity);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.view(identity);
  }

  /**
   * Merge a guest cart into the user's cart on login. Quantities sum (capped at
   * stock); the guest cart is deleted afterward.
   */
  async mergeGuestIntoUser(userId: string, sessionId: string): Promise<void> {
    const guest = await this.prisma.cart.findUnique({ where: { sessionId }, include: cartInclude });
    if (!guest || guest.items.length === 0) {
      if (guest) await this.prisma.cart.delete({ where: { id: guest.id } });
      return;
    }
    const userCart = await this.getOrCreate({ userId });

    for (const item of guest.items) {
      const existing = userCart.items.find((i) => i.variantId === item.variantId);
      const merged = Math.min(item.variant.stock, (existing?.quantity ?? 0) + item.quantity);
      await this.prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        create: { cartId: userCart.id, variantId: item.variantId, quantity: merged },
        update: { quantity: merged },
      });
    }
    if (!userCart.couponCode && guest.couponCode) {
      await this.prisma.cart.update({ where: { id: userCart.id }, data: { couponCode: guest.couponCode } });
    }
    await this.prisma.cart.delete({ where: { id: guest.id } });
  }
}
