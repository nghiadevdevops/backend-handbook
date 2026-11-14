import { OrderId } from '../../domain/order/order-id.js';
import type { OrderRepository } from '../../domain/order/order-repository.js';
import type { PayOrderUseCase } from '../port/in/pay-order-use-case.js';
import type { Clock } from '../port/out/clock.js';
import type { EventPublisher } from '../port/out/event-publisher.js';
import type { PayOrderCommand } from './pay-order-command.js';

export class PayOrderHandler implements PayOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async handle(command: PayOrderCommand): Promise<void> {
    const order = await this.orders.get(OrderId.of(command.orderId));
    order.markPaid(command.paymentReference, this.clock.now());
    await this.orders.save(order);

    for (const event of order.releaseEvents()) {
      await this.events.publish(event);
    }
  }
}
