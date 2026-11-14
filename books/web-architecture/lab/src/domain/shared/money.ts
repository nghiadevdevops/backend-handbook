import { DomainRuleViolation, InvalidArgumentError } from './errors.js';

/**
 * Value Object: bất biến, so sánh theo giá trị. Lưu số nguyên đơn vị nhỏ nhất
 * (VND không có phần lẻ nên 1 đơn vị = 1 đồng) để tránh sai số số thực (float).
 */
export class Money {
  private constructor(
    readonly amount: number,
    readonly currency: string,
  ) {
    if (!Number.isSafeInteger(amount)) {
      throw new InvalidArgumentError('Số tiền phải là số nguyên an toàn.');
    }
    if (amount < 0) {
      throw new DomainRuleViolation('Số tiền không được âm.');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvalidArgumentError('Mã tiền tệ phải gồm 3 chữ in hoa.');
    }
    Object.freeze(this);
  }

  static of(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }

  static vnd(amount: number): Money {
    return new Money(amount, 'VND');
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.#assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  format(): string {
    const grouped = String(this.amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${grouped} ${this.currency}`;
  }

  #assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainRuleViolation('Không thể cộng hai loại tiền tệ khác nhau.');
    }
  }
}
