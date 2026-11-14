import type { DomainEvent } from '../shared/domain-event.js';
import type { Money } from '../shared/money.js';
import type { CustomerId } from './customer-id.js';
import type { OrderId } from './order-id.js';

export class OrderPlaced implements DomainEvent {
  constructor(
    readonly orderId: OrderId,
    readonly customerId: CustomerId,
    readonly total: Money,
    readonly occurredAt: Date,
  ) {
    Object.freeze(this);
  }
}

export class OrderPaid implements DomainEvent {
  constructor(
    readonly orderId: OrderId,
    readonly customerId: CustomerId,
    readonly occurredAt: Date,
  ) {
    Object.freeze(this);
  }
}
