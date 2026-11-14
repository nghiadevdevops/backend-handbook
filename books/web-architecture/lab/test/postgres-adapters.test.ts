import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { PlaceOrderHandler } from '../src/application/place-order/place-order-handler.js';
import { PayOrderHandler } from '../src/application/pay-order/pay-order-handler.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { EbookNotFound } from '../src/domain/catalog/ebook-not-found.js';
import { EbookPurchasePolicy } from '../src/domain/order/ebook-purchase-policy.js';
import { AlreadyPurchased } from '../src/domain/order/errors.js';
import { Money } from '../src/domain/shared/money.js';
import { SynchronousEventPublisher } from '../src/infrastructure/in-memory/synchronous-event-publisher.js';
import { PgEbookCatalog } from '../src/infrastructure/postgres/pg-ebook-catalog.js';
import { PgOrderRepository } from '../src/infrastructure/postgres/pg-order-repository.js';
import { PgOrderSummaryReader } from '../src/infrastructure/postgres/pg-order-summary-reader.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';
import { orderRepositoryContract } from './order-repository.contract.js';

// Chỉ chạy khi có PostgreSQL thật: đặt DATABASE_URL=postgres://user:pass@host:5432/db
const url = process.env['DATABASE_URL'];
const skip = url === undefined;
const pool = new pg.Pool({ connectionString: url });

async function resetSchema(): Promise<void> {
  await pool.query('DROP TABLE IF EXISTS order_lines, orders, ebooks');
  await pool.query(await readFile('db/schema.sql', 'utf8'));
}

before(async () => {
  if (!skip) await resetSchema();
});
after(async () => {
  await pool.end();
});

orderRepositoryContract(
  'PostgreSQL',
  async () => {
    await pool.query('TRUNCATE order_lines, orders CASCADE');
    return new PgOrderRepository(pool);
  },
  { skip },
);

describe('PostgreSQL: catalog, read model và use case', { skip }, () => {
  test('PgEbookCatalog đọc e-book và ném EbookNotFound khi thiếu', async () => {
    await pool.query(
      "INSERT INTO ebooks (id, title, price_amount, price_currency) VALUES ('e1', 'Sách 1', 100, 'VND') ON CONFLICT DO NOTHING",
    );
    const catalog = new PgEbookCatalog(pool);
    const ebook = await catalog.get(EbookId.of('e1'));
    assert.equal(ebook.title, 'Sách 1');
    assert.ok(ebook.price.equals(Money.vnd(100)));
    await assert.rejects(catalog.get(EbookId.of('khong-co')), EbookNotFound);
  });

  test('PlaceOrder + PayOrder + read model chạy trên PostgreSQL', async () => {
    await pool.query('TRUNCATE order_lines, orders CASCADE');
    await pool.query(
      "INSERT INTO ebooks (id, title, price_amount, price_currency) VALUES ('e2', 'Sách 2', 250, 'VND') ON CONFLICT DO NOTHING",
    );
    const orders = new PgOrderRepository(pool);
    const clock = new FixedClock(new Date('2026-11-07T09:30:00Z'));
    const events = new SynchronousEventPublisher();
    const place = new PlaceOrderHandler(orders, new PgEbookCatalog(pool), new EbookPurchasePolicy(orders), clock, events);
    const pay = new PayOrderHandler(orders, clock, events);

    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    await pay.handle({ orderId: id, paymentReference: 'PAY-1' });
    await assert.rejects(place.handle({ customerId: 'c1', ebookIds: ['e1'] }), AlreadyPurchased);

    const summaries = await new PgOrderSummaryReader(pool).forCustomer('c1');
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0], {
      orderId: id,
      status: 'paid',
      totalAmount: 350,
      currency: 'VND',
      titles: ['Sách 1', 'Sách 2'],
      placedAt: '2026-11-07 09:30',
    });
  });

  test('save lỗi giữa chừng thì rollback, không để đơn dở dang', async () => {
    await pool.query('TRUNCATE order_lines, orders CASCADE');
    const orders = new PgOrderRepository(pool);
    const clock = new FixedClock(new Date('2026-11-07T09:30:00Z'));
    const catalog = new PgEbookCatalog(pool);
    const ebook = await catalog.get(EbookId.of('e1'));
    // Tên sách chứa ký tự NUL: PostgreSQL từ chối ở câu INSERT order_lines, sau khi INSERT orders đã chạy.
    const bad = new Ebook(ebook.id, 'x\u0000y', ebook.price);
    const catalogWithBad = { get: async () => bad };
    const place = new PlaceOrderHandler(
      orders,
      catalogWithBad,
      new EbookPurchasePolicy(orders),
      clock,
      new SynchronousEventPublisher(),
    );
    await assert.rejects(place.handle({ customerId: 'c9', ebookIds: ['e1'] }));
    const count = await pool.query('SELECT count(*)::int AS n FROM orders');
    assert.equal(count.rows[0]?.n, 0);
  });
});
