import { CouponType } from '@prisma/client';
import { evaluateCoupon } from './coupon.math';

const base = {
  active: true,
  expiresAt: null as Date | null,
  minSubtotal: null as number | null,
  usageLimit: null as number | null,
  usedCount: 0,
};

describe('evaluateCoupon', () => {
  it('applies a percent discount, rounding down', () => {
    const r = evaluateCoupon({ ...base, type: CouponType.PERCENT, value: 10 }, 1999);
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(199); // floor(1999 * 0.10) = 199
  });

  it('applies a fixed discount in cents', () => {
    const r = evaluateCoupon({ ...base, type: CouponType.FIXED, value: 500 }, 4000);
    expect(r.valid).toBe(true);
    expect(r.discount).toBe(500);
  });

  it('never discounts more than the subtotal', () => {
    const r = evaluateCoupon({ ...base, type: CouponType.FIXED, value: 9999 }, 4000);
    expect(r.discount).toBe(4000);
  });

  it('rejects inactive coupons', () => {
    const r = evaluateCoupon({ ...base, active: false, type: CouponType.PERCENT, value: 10 }, 5000);
    expect(r.valid).toBe(false);
    expect(r.discount).toBe(0);
  });

  it('rejects expired coupons', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const r = evaluateCoupon({ ...base, expiresAt: past, type: CouponType.PERCENT, value: 10 }, 5000);
    expect(r.valid).toBe(false);
  });

  it('enforces minimum subtotal', () => {
    const r = evaluateCoupon({ ...base, minSubtotal: 5000, type: CouponType.FIXED, value: 500 }, 4000);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/at least/i);
  });

  it('enforces usage limit', () => {
    const r = evaluateCoupon(
      { ...base, usageLimit: 5, usedCount: 5, type: CouponType.FIXED, value: 500 },
      5000,
    );
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/usage limit/i);
  });

  it('clamps percent values to 0–100', () => {
    const r = evaluateCoupon({ ...base, type: CouponType.PERCENT, value: 250 }, 1000);
    expect(r.discount).toBe(1000); // 100% capped, never exceeds subtotal
  });
});
