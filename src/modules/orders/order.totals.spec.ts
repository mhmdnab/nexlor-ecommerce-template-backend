import { computeSubtotal, computeTotals } from './order.totals';

describe('order totals', () => {
  it('sums line items', () => {
    expect(
      computeSubtotal([
        { unitPrice: 1999, quantity: 2 },
        { unitPrice: 500, quantity: 3 },
      ]),
    ).toBe(1999 * 2 + 500 * 3);
  });

  it('computes total = (subtotal - discount) + shipping + tax', () => {
    const t = computeTotals({ subtotal: 10000, discount: 1000, shipping: 500, tax: 720 });
    expect(t.total).toBe(10000 - 1000 + 500 + 720);
  });

  it('clamps discount to the subtotal (never negative total)', () => {
    const t = computeTotals({ subtotal: 4000, discount: 99999, shipping: 0, tax: 0 });
    expect(t.discount).toBe(4000);
    expect(t.total).toBe(0);
  });

  it('keeps everything in integer cents', () => {
    const t = computeTotals({ subtotal: 1234, discount: 0, shipping: 599, tax: 99 });
    expect(Number.isInteger(t.total)).toBe(true);
  });
});
