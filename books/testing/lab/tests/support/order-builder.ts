import { Money } from '../../src/domain/money.ts';
import { Order } from '../../src/domain/order.ts';

interface Spec {
  id: string;
  customerId: string;
  lines: readonly (readonly [string, number, number])[];
  placed: boolean;
  paid: boolean;
}

/** Test Data Builder: valid defaults, each test states only what matters to it. Immutable. */
export class OrderBuilder {
  readonly #spec: Spec;

  private constructor(spec: Spec) {
    this.#spec = spec;
  }

  static anOrder(): OrderBuilder {
    return new OrderBuilder({
      id: 'o-1',
      customerId: 'c-1',
      lines: [['SKU-1', 1, 100_000]],
      placed: false,
      paid: false,
    });
  }

  withId(id: string): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, id });
  }

  withLine(sku: string, qty: number, price: number): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, lines: [...this.#spec.lines, [sku, qty, price]] });
  }

  withoutLines(): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, lines: [] });
  }

  placed(): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, placed: true });
  }

  paid(): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, placed: true, paid: true });
  }

  build(): Order {
    const order = new Order(this.#spec.id, this.#spec.customerId);
    for (const [sku, qty, price] of this.#spec.lines) {
      order.addLine(sku, qty, Money.vnd(price));
    }
    if (this.#spec.placed) {
      order.place(new Date('2026-11-01T10:00:00+00:00'));
    }
    if (this.#spec.paid) {
      order.markPaid();
    }

    return order;
  }
}
