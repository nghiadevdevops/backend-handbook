import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { CustomerId } from '../src/domain/order/customer-id.js';
import { Order } from '../src/domain/order/order.js';
import { OrderPaid, OrderPlaced } from '../src/domain/order/order-events.js';
import { OrderId } from '../src/domain/order/order-id.js';
import { OrderLine } from '../src/domain/order/order-line.js';
import { OrderStatus } from '../src/domain/order/order-status.js';
import { DomainRuleViolation, InvalidArgumentError } from '../src/domain/shared/errors.js';
import { Money } from '../src/domain/shared/money.js';

const t0 = new Date('2026-11-07T09:30:00Z');
const line1 = new OrderLine(EbookId.of('e1'), 'Sách 1', Money.vnd(100));
const line2 = new OrderLine(EbookId.of('e2'), 'Sách 2', Money.vnd(250));
const newOrder = () => Order.place(OrderId.generate(), CustomerId.of('c1'), [line1, line2], t0);

describe('Value Object', () => {
  test('Money so sánh theo giá trị', () => {
    assert.ok(Money.vnd(100).equals(Money.vnd(100)));
  });

  test('Money.add trả đối tượng mới, bản gốc không đổi', () => {
    const a = Money.vnd(100);
    const b = a.add(Money.vnd(50));
    assert.equal(a.amount, 100);
    assert.equal(b.amount, 150);
  });

  test('Money khác tiền tệ không cộng được', () => {
    assert.throws(() => Money.vnd(1).add(Money.of(1, 'USD')), DomainRuleViolation);
  });

  test('Money không âm, không lẻ, mã tiền tệ đúng 3 chữ in hoa', () => {
    assert.throws(() => Money.vnd(-1), DomainRuleViolation);
    assert.throws(() => Money.vnd(1.5), InvalidArgumentError);
    assert.throws(() => Money.of(1, 'vnd'), InvalidArgumentError);
  });

  test('Money bất biến lúc chạy', () => {
    const m = Money.vnd(100);
    assert.throws(() => {
      (m as { amount: number }).amount = 1;
    }, TypeError);
  });

  test('ID so sánh theo giá trị (branded string nên dùng ===)', () => {
    assert.equal(OrderId.of('a'), OrderId.of('a'));
  });

  test('ID rỗng hoặc sai kiểu lúc chạy bị từ chối', () => {
    assert.throws(() => OrderId.of('  '), InvalidArgumentError);
    assert.throws(() => OrderId.of(123 as unknown as string), InvalidArgumentError);
  });

  test('Money.format nhóm hàng nghìn bằng dấu chấm', () => {
    assert.equal(Money.vnd(215_000).format(), '215.000 VND');
  });
});

describe('Entity và Aggregate', () => {
  test('Entity Ebook so sánh theo ID dù giá đổi', () => {
    const x = new Ebook(EbookId.of('e1'), 'A', Money.vnd(10));
    const y = new Ebook(EbookId.of('e1'), 'A', Money.vnd(10));
    y.reprice(Money.vnd(99));
    assert.ok(x.equals(y));
  });

  test('Order tự tính tổng tiền', () => {
    assert.ok(newOrder().total().equals(Money.vnd(350)));
  });

  test('Order mới ở trạng thái Pending', () => {
    assert.equal(newOrder().status, OrderStatus.Pending);
  });

  test('Order.place phát OrderPlaced đúng một lần', () => {
    const order = newOrder();
    const events = order.releaseEvents();
    assert.equal(events.length, 1);
    assert.ok(events[0] instanceof OrderPlaced);
    assert.deepEqual(order.releaseEvents(), []);
  });

  test('Order rỗng bị từ chối', () => {
    assert.throws(() => Order.place(OrderId.generate(), CustomerId.of('c1'), [], t0), DomainRuleViolation);
  });

  test('Order trùng e-book bị từ chối', () => {
    assert.throws(() => Order.place(OrderId.generate(), CustomerId.of('c1'), [line1, line1], t0), DomainRuleViolation);
  });

  test('markPaid chuyển sang Paid và phát OrderPaid', () => {
    const order = newOrder();
    order.releaseEvents();
    order.markPaid('P1', t0);
    assert.equal(order.status, OrderStatus.Paid);
    assert.ok(order.releaseEvents()[0] instanceof OrderPaid);
  });

  test('Thanh toán hai lần bị từ chối', () => {
    const order = newOrder();
    order.markPaid('P1', t0);
    assert.throws(() => order.markPaid('P2', t0), DomainRuleViolation);
  });

  test('Đơn đã trả không huỷ được', () => {
    const order = newOrder();
    order.markPaid('P1', t0);
    assert.throws(() => order.cancel(), DomainRuleViolation);
  });

  test('Sửa Date lấy ra không làm đổi trạng thái của Order', () => {
    const order = newOrder();
    order.placedAt.setFullYear(1999);
    assert.equal(order.placedAt.getTime(), t0.getTime());
  });
});
