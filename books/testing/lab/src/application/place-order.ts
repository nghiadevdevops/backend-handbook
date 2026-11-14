import { Money } from '../domain/money.ts';
import { Order } from '../domain/order.ts';
import type { Clock, OrderRepository } from './ports.ts';

export interface LineInput {
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** Use case: place an order. */
export class PlaceOrder {
  readonly #orders: OrderRepository;
  readonly #clock: Clock;

  constructor(orders: OrderRepository, clock: Clock) {
    this.#orders = orders;
    this.#clock = clock;
  }

  async execute(orderId: string, customerId: string, lines: readonly LineInput[]): Promise<void> {
    const order = new Order(orderId, customerId);
    for (const line of lines) {
      order.addLine(line.sku, line.quantity, Money.vnd(line.unitPrice));
    }
    order.place(this.#clock.now());

    await this.#orders.save(order);
  }
}
