import type { OrderPlaced } from '../../domain/order/order-events.js';
import type { OrderNotifier } from '../port/out/order-notifier.js';

/** Chỉ phụ thuộc port OrderNotifier, không biết mail hay SMS. */
export class SendOrderConfirmationWhenOrderPlaced {
  constructor(private readonly notifier: OrderNotifier) {}

  async handle(event: OrderPlaced): Promise<void> {
    await this.notifier.sendOrderConfirmation(event.customerId, event.orderId, event.total);
  }
}
