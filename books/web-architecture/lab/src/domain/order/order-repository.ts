import type { EbookId } from '../catalog/ebook-id.js';
import type { CustomerId } from './customer-id.js';
import type { Order } from './order.js';
import type { OrderId } from './order-id.js';

/**
 * Repository kiểu persistence-oriented (save). Chứa đủ mọi method mà core gọi.
 */
export interface OrderRepository {
  /** Sinh ID mới ở phía ứng dụng (UUID v4), trước khi lưu. */
  nextIdentity(): OrderId;

  save(order: Order): Promise<void>;

  /** @throws OrderNotFound */
  get(id: OrderId): Promise<Order>;

  /** Khách này đã có đơn ĐÃ THANH TOÁN chứa e-book này chưa? */
  customerHasPaidFor(customerId: CustomerId, ebookId: EbookId): Promise<boolean>;
}
