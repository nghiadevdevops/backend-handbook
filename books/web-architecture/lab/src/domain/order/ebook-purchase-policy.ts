import type { EbookId } from '../catalog/ebook-id.js';
import type { CustomerId } from './customer-id.js';
import { AlreadyPurchased } from './errors.js';
import type { OrderRepository } from './order-repository.js';

/**
 * Domain service: luật "không mua lại e-book đã sở hữu" cần dữ liệu của nhiều đơn,
 * không thuộc về một Order cụ thể. Phụ thuộc interface OrderRepository của domain
 * nên vẫn là core thuần.
 */
export class EbookPurchasePolicy {
  constructor(private readonly orders: OrderRepository) {}

  /** @throws AlreadyPurchased */
  async assertCanBuy(customerId: CustomerId, ebookIds: readonly EbookId[]): Promise<void> {
    for (const ebookId of ebookIds) {
      if (await this.orders.customerHasPaidFor(customerId, ebookId)) {
        throw AlreadyPurchased.by(customerId, ebookId);
      }
    }
  }
}
