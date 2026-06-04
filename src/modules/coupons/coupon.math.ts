import { Coupon, CouponType } from '@prisma/client';

export interface CouponEvaluation {
  valid: boolean;
  /** Discount in cents (never exceeds subtotal). 0 when invalid. */
  discount: number;
  reason?: string;
}

/**
 * Pure, side-effect-free coupon evaluation. All money in cents. This is the
 * single source of truth for discount math and is unit tested directly
 * (coupon.math.spec.ts) — keep it pure.
 */
export function evaluateCoupon(
  coupon: Pick<Coupon, 'type' | 'value' | 'active' | 'expiresAt' | 'minSubtotal' | 'usageLimit' | 'usedCount'>,
  subtotal: number,
  now: Date = new Date(),
): CouponEvaluation {
  if (!coupon.active) return { valid: false, discount: 0, reason: 'This coupon is no longer active.' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
    return { valid: false, discount: 0, reason: 'This coupon has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discount: 0, reason: 'This coupon has reached its usage limit.' };
  }
  if (coupon.minSubtotal != null && subtotal < coupon.minSubtotal) {
    return {
      valid: false,
      discount: 0,
      reason: `Spend at least ${(coupon.minSubtotal / 100).toFixed(2)} to use this coupon.`,
    };
  }

  let discount: number;
  if (coupon.type === CouponType.PERCENT) {
    // value is a percent 0–100; round down so we never over-discount.
    const pct = Math.max(0, Math.min(100, coupon.value));
    discount = Math.floor((subtotal * pct) / 100);
  } else {
    discount = coupon.value; // FIXED, in cents
  }

  // Discount can never make the order negative.
  discount = Math.max(0, Math.min(discount, subtotal));
  return { valid: true, discount };
}
