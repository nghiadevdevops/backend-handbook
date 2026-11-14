import type { Order } from '../domain/order.ts';

export interface OrderResponse {
  id: string;
  status: string;
  total: number;
  currency: string;
  lines: { sku: string; quantity: number; unitPrice: number }[];
}

/** Turns an Order into a JSON-friendly object: this is the "contract" with clients. */
export function presentOrder(order: Order): OrderResponse {
  const total = order.total();

  return {
    id: order.id,
    status: order.status,
    total: total.amount,
    currency: total.currency,
    lines: order.lines.map((l) => ({
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice.amount,
    })),
  };
}
