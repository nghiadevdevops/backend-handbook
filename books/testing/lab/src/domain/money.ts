/** Value object. `amount` is an integer number of the smallest unit (VND has no decimals). */
export class Money {
  readonly amount: number;
  readonly currency: string;

  private constructor(amount: number, currency: string) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new RangeError('Money khong duoc am');
    }
    this.amount = amount;
    this.currency = currency;
  }

  static of(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }

  static vnd(amount: number): Money {
    return Money.of(amount, 'VND');
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);

    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  /** Whole-percent discount (0..100), rounded down. */
  discountPercent(percent: number): Money {
    return new Money(Math.floor((this.amount * (100 - percent)) / 100), this.currency);
  }

  isAtLeast(other: Money): boolean {
    this.assertSameCurrency(other);

    return this.amount >= other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new RangeError('Khac don vi tien te');
    }
  }
}
