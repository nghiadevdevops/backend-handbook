import type { EbookCatalog } from '../../domain/catalog/ebook-catalog.js';
import { EbookId } from '../../domain/catalog/ebook-id.js';
import { CustomerId } from '../../domain/order/customer-id.js';
import type { EbookPurchasePolicy } from '../../domain/order/ebook-purchase-policy.js';
import { Order } from '../../domain/order/order.js';
import type { OrderId } from '../../domain/order/order-id.js';
import { OrderLine } from '../../domain/order/order-line.js';
import type { OrderRepository } from '../../domain/order/order-repository.js';
import type { PlaceOrderUseCase } from '../port/in/place-order-use-case.js';
import type { Clock } from '../port/out/clock.js';
import type { EventPublisher } from '../port/out/event-publisher.js';
import type { PlaceOrderCommand } from './place-order-command.js';

/** Phối hợp use case. Không chứa luật nghiệp vụ: luật ở Order và EbookPurchasePolicy. */
export class PlaceOrderHandler implements PlaceOrderUseCase {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: EbookCatalog,
    private readonly policy: EbookPurchasePolicy,
    private readonly clock: Clock,
    private readonly events: EventPublisher,
  ) {}

  async handle(command: PlaceOrderCommand): Promise<OrderId> {
    const customerId = CustomerId.of(command.customerId);
    const ebookIds = command.ebookIds.map(EbookId.of);

    await this.policy.assertCanBuy(customerId, ebookIds);

    const lines: OrderLine[] = [];
    for (const ebookId of ebookIds) {
      const ebook = await this.catalog.get(ebookId);
      lines.push(new OrderLine(ebook.id, ebook.title, ebook.price));
    }

    const order = Order.place(this.orders.nextIdentity(), customerId, lines, this.clock.now());
    await this.orders.save(order);

    for (const event of order.releaseEvents()) {
      await this.events.publish(event);
    }

    return order.id;
  }
}
