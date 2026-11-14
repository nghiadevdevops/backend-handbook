import type { OrderSummary } from '../../application/query/order-summary.js';
import type { OrderSummaryReader } from '../../application/query/order-summary-reader.js';
import { formatPlacedAt } from '../format-placed-at.js';
import type { InMemoryOrderRepository } from './in-memory-order-repository.js';

export class InMemoryOrderSummaryReader implements OrderSummaryReader {
  constructor(private readonly orders: InMemoryOrderRepository) {}

  async forCustomer(customerId: string): Promise<readonly OrderSummary[]> {
    return this.orders
      .all()
      .filter((order) => order.customerId === customerId)
      .toSorted((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
      .map((order) => ({
        orderId: order.id,
        status: order.status,
        totalAmount: order.total().amount,
        currency: order.total().currency,
        titles: order.lines.map((line) => line.title),
        placedAt: formatPlacedAt(order.placedAt),
      }));
  }
}
