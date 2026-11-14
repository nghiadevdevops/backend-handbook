import type { CustomerId } from '../../../domain/order/customer-id.js';
import type { OrderId } from '../../../domain/order/order-id.js';
import type { Money } from '../../../domain/shared/money.js';

/**
 * Secondary port hướng nghiệp vụ: nói "gửi xác nhận đơn", không nói gửi bằng gì.
 */
export interface OrderNotifier {
  sendOrderConfirmation(customerId: CustomerId, orderId: OrderId, total: Money): Promise<void>;
}
