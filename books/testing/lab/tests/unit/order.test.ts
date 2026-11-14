import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/domain/domain-error.ts';
import { Money } from '../../src/domain/money.ts';
import { MAX_LINES, Order } from '../../src/domain/order.ts';
import { OrderBuilder } from '../support/order-builder.ts';

describe('Order', () => {
  // --- OUTPUT checks (pure function: total) ---------------------------

  it('total is sum of line subtotals', () => {
    const order = OrderBuilder.anOrder().withoutLines().build();
    order.addLine('A', 2, Money.vnd(100_000));
    order.addLine('B', 1, Money.vnd(50_000));

    expect(order.total().amount).toBe(250_000);
  });

  it('no discount just below vip threshold', () => {
    const order = OrderBuilder.anOrder().withoutLines().build();
    order.addLine('A', 1, Money.vnd(999_999));

    expect(order.total().amount).toBe(999_999);
  });

  it('discount applies exactly at vip threshold', () => {
    const order = OrderBuilder.anOrder().withoutLines().build();
    order.addLine('A', 1, Money.vnd(1_000_000));

    expect(order.total().amount).toBe(900_000);
  });

  // --- STATE checks (commands) -----------------------------------------

  it('placing a draft order records status and time', () => {
    const order = OrderBuilder.anOrder().build();
    const now = new Date('2026-11-07T09:30:00+00:00');

    order.place(now);

    expect(order.status).toBe('placed');
    expect(order.placedAt).toEqual(now);
  });

  it('cannot place an order twice', () => {
    const order = OrderBuilder.anOrder().placed().build();

    expect(() => order.place(new Date())).toThrow(DomainError);
    expect(() => order.place(new Date())).toThrow('Chi dat duoc don dang nhap');
  });

  it('empty order cannot be placed', () => {
    const order = OrderBuilder.anOrder().withoutLines().build();

    expect(() => order.place(new Date())).toThrow(DomainError);
    expect(() => order.place(new Date())).toThrow('Don rong');
  });

  it('cannot add line after placing', () => {
    const order = OrderBuilder.anOrder().placed().build();

    expect(() => order.addLine('X', 1, Money.vnd(1))).toThrow('Chi them dong khi don dang nhap');
  });

  it('allows at most five lines', () => {
    const order = new Order('o-9', 'c-1');
    for (let i = 1; i <= MAX_LINES; i++) {
      order.addLine(`SKU-${i}`, 1, Money.vnd(1_000));
    }

    expect(() => order.addLine('SKU-6', 1, Money.vnd(1_000))).toThrow(new DomainError('Don toi da 5 dong'));
  });

  it('rejects zero quantity', () => {
    const order = OrderBuilder.anOrder().build();

    expect(() => order.addLine('A', 0, Money.vnd(1_000))).toThrow('So luong phai >= 1');
  });

  it('only placed orders can be paid', () => {
    const draft = OrderBuilder.anOrder().build();

    expect(() => draft.markPaid()).toThrow('Chi thanh toan don da dat');
  });

  it('paid order cannot be cancelled', () => {
    const order = OrderBuilder.anOrder().paid().build();

    expect(() => order.cancel()).toThrow(DomainError);
    expect(() => order.cancel()).toThrow('khong the huy');
  });

  it('cancelling twice is rejected', () => {
    const order = OrderBuilder.anOrder().placed().build();
    order.cancel();

    expect(() => order.cancel()).toThrow('huy roi');
  });

  it('placed order can be cancelled', () => {
    const order = OrderBuilder.anOrder().placed().build();

    order.cancel();

    expect(order.status).toBe('cancelled');
  });

  it('exposes identity and lines', () => {
    const order = OrderBuilder.anOrder().withId('o-77').build();

    expect(order.id).toBe('o-77');
    expect(order.customerId).toBe('c-1');
    expect(order.lines).toHaveLength(1);
  });
});
