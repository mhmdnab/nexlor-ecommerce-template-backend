/**
 * Pure order-total math (cents). Server-authoritative — checkout NEVER trusts
 * client-sent totals; it recomputes from current variant prices using this.
 * Unit tested in order.totals.spec.ts.
 */
export interface OrderLineInput {
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export function computeSubtotal(lines: OrderLineInput[]): number {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function computeTotals(params: {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
}): OrderTotals {
  const discount = Math.max(0, Math.min(params.discount, params.subtotal));
  const total = Math.max(0, params.subtotal - discount) + params.shipping + params.tax;
  return { subtotal: params.subtotal, discount, shipping: params.shipping, tax: params.tax, total };
}
