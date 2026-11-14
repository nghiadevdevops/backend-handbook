import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { CustomerId } from '../src/domain/order/customer-id.js';
import { OrderNotFound } from '../src/domain/order/errors.js';
import { Order } from '../src/domain/order/order.js';
import { OrderId } from '../src/domain/order/order-id.js';
import { OrderLine } from '../src/domain/order/order-line.js';
import type { OrderRepository } from '../src/domain/order/order-repository.js';
import { OrderStatus } from '../src/domain/order/order-status.js';
import { Money } from '../src/domain/shared/money.js';

const t0 = new Date('2026-11-07T09:30:00Z');
const t1 = new Date('2026-11-07T10:00:00Z');

/**
 * Contract test: một bộ khẳng định chung cho mọi implementation của OrderRepository.
 * `create` trả về repository MỚI, rỗng cho mỗi test.
 */
export function orderRepositoryContract(name: string, create: () => Promise<OrderRepository>, options: { skip?: boolean } = {}): void {
  describe(`OrderRepository contract: ${name}`, { skip: options.skip === true }, () => {
    const lines = [
      new OrderLine(EbookId.of('e1'), 'Sách 1', Money.vnd(100)),
      new OrderLine(EbookId.of('e2'), 'Sách 2', Money.vnd(250)),
    ];

    test('save rồi get ra đơn bằng nhau (kể cả thứ tự dòng)', async () => {
      const repo = await create();
      const order = Order.place(repo.nextIdentity(), CustomerId.of('c1'), lines, t0);
      await repo.save(order);

      const loaded = await repo.get(order.id);
      assert.ok(loaded.equals(order));
      assert.equal(loaded.customerId, 'c1');
      assert.equal(loaded.status, OrderStatus.Pending);
      assert.equal(loaded.placedAt.getTime(), t0.getTime());
      assert.equal(loaded.paidAt, null);
      assert.ok(loaded.total().equals(Money.vnd(350)));
      assert.equal(loaded.lines.length, 2);
      loaded.lines.forEach((line, index) => assert.ok(line.equals(lines[index] as OrderLine)));
    });

    test('get dựng lại không phát lại event', async () => {
      const repo = await create();
      const order = Order.place(repo.nextIdentity(), CustomerId.of('c1'), lines, t0);
      await repo.save(order);
      order.releaseEvents(); // như handler: save xong thì phát event
      assert.deepEqual((await repo.get(order.id)).releaseEvents(), []);
    });

    test('save lần hai cập nhật trạng thái và giờ thanh toán', async () => {
      const repo = await create();
      const order = Order.place(repo.nextIdentity(), CustomerId.of('c1'), lines, t0);
      await repo.save(order);
      order.markPaid('PAY-1', t1);
      await repo.save(order);

      const loaded = await repo.get(order.id);
      assert.equal(loaded.status, OrderStatus.Paid);
      assert.equal(loaded.paidAt?.getTime(), t1.getTime());
      assert.equal(loaded.lines.length, 2);
    });

    test('get id lạ ném OrderNotFound', async () => {
      const repo = await create();
      await assert.rejects(repo.get(OrderId.generate()), OrderNotFound);
    });

    test('customerHasPaidFor chỉ đúng khi đơn đã trả tiền và có sách đó', async () => {
      const repo = await create();
      const order = Order.place(repo.nextIdentity(), CustomerId.of('c1'), lines, t0);
      await repo.save(order);
      assert.equal(await repo.customerHasPaidFor(CustomerId.of('c1'), EbookId.of('e1')), false);

      order.markPaid('PAY-1', t1);
      await repo.save(order);
      assert.equal(await repo.customerHasPaidFor(CustomerId.of('c1'), EbookId.of('e1')), true);
      assert.equal(await repo.customerHasPaidFor(CustomerId.of('c1'), EbookId.of('khac')), false);
      assert.equal(await repo.customerHasPaidFor(CustomerId.of('c2'), EbookId.of('e1')), false);
    });
  });
}
