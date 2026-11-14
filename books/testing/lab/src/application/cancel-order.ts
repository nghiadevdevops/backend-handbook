import type { OrderRepository } from './ports.ts';

/** Use case: cancel an order. */
export class CancelOrder {
  readonly #orders: OrderRepository;

  constructor(orders: OrderRepository) {
    this.#orders = orders;
  }

  async execute(orderId: string): Promise<void> {
    const order = await this.#orders.get(orderId);
    order.cancel();
    await this.#orders.save(order);
  }
}
