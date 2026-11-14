import { DomainError } from './domain-error.ts';
import { Money } from './money.ts';
import { OrderLine } from './order-line.ts';
import type { OrderStatus } from './order-status.ts';

export const MAX_LINES = 5;
export const VIP_THRESHOLD = 1_000_000;
export const VIP_DISCOUNT_PERCENT = 10;

export class Order {
  #lines: OrderLine[] = [];
  #status: OrderStatus = 'draft';
  #placedAt: Date | null = null;

  readonly id: string;
  readonly customerId: string;

  constructor(id: string, customerId: string) {
    this.id = id;
    this.customerId = customerId;
  }

  /** Rebuild an Order from storage (does not re-run the add-line rules). */
  static reconstitute(
    id: string,
    customerId: string,
    status: OrderStatus,
    placedAt: Date | null,
    lines: readonly OrderLine[],
  ): Order {
    const order = new Order(id, customerId);
    order.#status = status;
    order.#placedAt = placedAt === null ? null : new Date(placedAt);
    order.#lines = [...lines];

    return order;
  }

  addLine(sku: string, quantity: number, unitPrice: Money): void {
    this.#assertStatus('draft', 'Chi them dong khi don dang nhap');
    if (this.#lines.length >= MAX_LINES) {
      throw new DomainError(`Don toi da ${MAX_LINES} dong`);
    }
    this.#lines.push(new OrderLine(sku, quantity, unitPrice));
  }

  place(now: Date): void {
    this.#assertStatus('draft', 'Chi dat duoc don dang nhap');
    if (this.#lines.length === 0) {
      throw new DomainError('Don rong khong the dat');
    }
    this.#status = 'placed';
    this.#placedAt = new Date(now);
  }

  markPaid(): void {
    this.#assertStatus('placed', 'Chi thanh toan don da dat');
    this.#status = 'paid';
  }

  cancel(): void {
    if (this.#status === 'paid') {
      throw new DomainError('Don da thanh toan khong the huy');
    }
    if (this.#status === 'cancelled') {
      throw new DomainError('Don da huy roi');
    }
    this.#status = 'cancelled';
  }

  total(): Money {
    let sum = Money.vnd(0);
    for (const line of this.#lines) {
      sum = sum.add(line.subtotal());
    }

    if (sum.isAtLeast(Money.vnd(VIP_THRESHOLD))) {
      return sum.discountPercent(VIP_DISCOUNT_PERCENT);
    }

    return sum;
  }

  get status(): OrderStatus {
    return this.#status;
  }

  get placedAt(): Date | null {
    return this.#placedAt === null ? null : new Date(this.#placedAt);
  }

  get lines(): readonly OrderLine[] {
    return [...this.#lines];
  }

  #assertStatus(expected: OrderStatus, message: string): void {
    if (this.#status !== expected) {
      throw new DomainError(message);
    }
  }
}
