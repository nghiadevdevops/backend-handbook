import type { EbookId } from '../catalog/ebook-id.js';
import { DomainRuleViolation } from '../shared/errors.js';
import type { CustomerId } from './customer-id.js';
import type { OrderId } from './order-id.js';

export class OrderNotFound extends DomainRuleViolation {
  static withId(id: OrderId): OrderNotFound {
    return new OrderNotFound(`Không tìm thấy đơn hàng ${id}.`);
  }
}

export class AlreadyPurchased extends DomainRuleViolation {
  static by(customerId: CustomerId, ebookId: EbookId): AlreadyPurchased {
    return new AlreadyPurchased(`Khách ${customerId} đã mua e-book ${ebookId} rồi.`);
  }
}
