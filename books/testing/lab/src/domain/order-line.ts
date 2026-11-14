import { DomainError } from './domain-error.ts';
import { Money } from './money.ts';

export class OrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;

  constructor(sku: string, quantity: number, unitPrice: Money) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DomainError('So luong phai >= 1');
    }
    this.sku = sku;
    this.quantity = quantity;
    this.unitPrice = unitPrice;
  }

  subtotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }
}
