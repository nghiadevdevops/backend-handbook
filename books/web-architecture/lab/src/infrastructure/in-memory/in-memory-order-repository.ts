import type { EbookId } from '../../domain/catalog/ebook-id.js';
import type { CustomerId } from '../../domain/order/customer-id.js';
import { OrderNotFound } from '../../domain/order/errors.js';
import type { Order } from '../../domain/order/order.js';
import { OrderId } from '../../domain/order/order-id.js';
import type { OrderRepository } from '../../domain/order/order-repository.js';
import { OrderStatus } from '../../domain/order/order-status.js';

export class InMemoryOrderRepository implements OrderRepository {
  readonly #orders = new Map<string, Order>();

  nextIdentity(): OrderId {
    return OrderId.generate();
  }

  async save(order: Order): Promise<void> {
    this.#orders.set(order.id, order);
  }

  async get(id: OrderId): Promise<Order> {
    const order = this.#orders.get(id);
    if (order === undefined) {
      throw OrderNotFound.withId(id);
    }
    return order;
  }

  async customerHasPaidFor(customerId: CustomerId, ebookId: EbookId): Promise<boolean> {
    return [...this.#orders.values()].some(
      (order) => order.customerId === customerId && order.status === OrderStatus.Paid && order.contains(ebookId),
    );
  }

  /** Chỉ dùng cho adapter đọc in-memory. */
  all(): readonly Order[] {
    return [...this.#orders.values()];
  }
}
