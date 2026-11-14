import { OrderNotFound } from '../application/order-not-found.ts';
import type { OrderRepository } from '../application/ports.ts';
import { Order } from '../domain/order.ts';

/** Fake adapter: used by use case and acceptance tests. */
export class InMemoryOrderRepository implements OrderRepository {
  readonly #orders = new Map<string, Order>();

  // Store and return COPIES, like a real DB: mutating an object outside does not change
  // the "saved" data. Otherwise tests cannot detect a forgotten save().
  async save(order: Order): Promise<void> {
    this.#orders.set(order.id, copyOf(order));
  }

  async get(id: string): Promise<Order> {
    const order = this.#orders.get(id);
    if (order === undefined) {
      throw OrderNotFound.withId(id);
    }

    return copyOf(order);
  }
}

function copyOf(order: Order): Order {
  return Order.reconstitute(order.id, order.customerId, order.status, order.placedAt, order.lines);
}
