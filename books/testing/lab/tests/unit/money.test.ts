import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/money.ts';

describe('Money', () => {
  it('adds amounts of same currency', () => {
    const sum = Money.vnd(100).add(Money.vnd(250));

    expect(sum.amount).toBe(350);
    expect(sum.currency).toBe('VND');
  });

  it('rejects negative amount', () => {
    expect(() => Money.vnd(-1)).toThrow(new RangeError('Money khong duoc am'));
  });

  it.each([
    ['giam 10% cua 1.000.000', 1_000_000, 10, 900_000],
    ['lam tron xuong', 999, 10, 899],
    ['giam 0%', 500, 0, 500],
    ['giam 100%', 500, 100, 0],
  ])('applies percent discount rounding down: %s', (_name, amount, percent, expected) => {
    expect(Money.vnd(amount).discountPercent(percent).amount).toBe(expected);
  });

  it('compares with threshold inclusively', () => {
    expect(Money.vnd(100).isAtLeast(Money.vnd(100))).toBe(true);
    expect(Money.vnd(99).isAtLeast(Money.vnd(100))).toBe(false);
  });

  it('cannot add different currencies', () => {
    expect(() => Money.vnd(100).add(Money.of(1, 'USD'))).toThrow(new RangeError('Khac don vi tien te'));
  });

  it('cannot compare different currencies', () => {
    expect(() => Money.vnd(100).isAtLeast(Money.of(1, 'USD'))).toThrow(new RangeError('Khac don vi tien te'));
  });

  it('equality is by value', () => {
    expect(Money.vnd(5).equals(Money.of(5, 'USD'))).toBe(false);
    expect(Money.vnd(5).equals(Money.vnd(5))).toBe(true);
    expect(Money.vnd(5).equals(Money.vnd(6))).toBe(false);
  });
});
