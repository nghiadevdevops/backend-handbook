import type { Money } from '../domain/money.ts';
import type { Order } from '../domain/order.ts';

/** Driven port: the application defines it, infrastructure implements it. Async because real I/O is async. */
export interface OrderRepository {
  save(order: Order): Promise<void>;
  /** @throws OrderNotFound */
  get(id: string): Promise<Order>;
}

/** Driven port to the external payment system. Resolves true when the charge succeeded. */
export interface PaymentGateway {
  charge(orderId: string, amount: Money): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}
