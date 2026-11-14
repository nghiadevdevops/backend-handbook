import type { OrderNotifier } from '../../application/port/out/order-notifier.js';
import type { CustomerId } from '../../domain/order/customer-id.js';
import type { OrderId } from '../../domain/order/order-id.js';
import type { Money } from '../../domain/shared/money.js';

/** Adapter test: ghi lại thay vì gửi thật. */
export class RecordingOrderNotifier implements OrderNotifier {
  readonly sent: string[] = [];

  async sendOrderConfirmation(customerId: CustomerId, orderId: OrderId, total: Money): Promise<void> {
    this.sent.push(`${customerId}|${orderId}|${total.format()}`);
  }
}
