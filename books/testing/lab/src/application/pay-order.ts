import { DomainError } from '../domain/domain-error.ts';
import type { OrderRepository, PaymentGateway } from './ports.ts';

/** Use case: pay a placed order. */
export class PayOrder {
  readonly #orders: OrderRepository;
  readonly #payments: PaymentGateway;

  constructor(orders: OrderRepository, payments: PaymentGateway) {
    this.#orders = orders;
    this.#payments = payments;
  }

  async execute(orderId: string): Promise<void> {
    const order = await this.#orders.get(orderId);

    if (!(await this.#payments.charge(order.id, order.total()))) {
      throw new DomainError('Thanh toan bi tu choi');
    }

    order.markPaid();
    await this.#orders.save(order);
  }
}
