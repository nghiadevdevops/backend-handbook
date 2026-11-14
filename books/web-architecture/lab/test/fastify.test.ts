import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SendOrderConfirmationWhenOrderPlaced } from '../src/application/listener/send-order-confirmation-when-order-placed.js';
import { PlaceOrderHandler } from '../src/application/place-order/place-order-handler.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { EbookPurchasePolicy } from '../src/domain/order/ebook-purchase-policy.js';
import { OrderPlaced } from '../src/domain/order/order-events.js';
import { Money } from '../src/domain/shared/money.js';
import { buildApp } from '../src/fastify/build-app.js';
import { InMemoryEbookCatalog } from '../src/infrastructure/in-memory/in-memory-ebook-catalog.js';
import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { InMemoryOrderSummaryReader } from '../src/infrastructure/in-memory/in-memory-order-summary-reader.js';
import { RecordingOrderNotifier } from '../src/infrastructure/in-memory/recording-order-notifier.js';
import { SynchronousEventPublisher } from '../src/infrastructure/in-memory/synchronous-event-publisher.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';

test('Fastify ghép thủ công: cùng core, không DI container', async () => {
  const orders = new InMemoryOrderRepository();
  const catalog = new InMemoryEbookCatalog();
  catalog.add(new Ebook(EbookId.of('e1'), 'Sách 1', Money.vnd(100)));
  const notifier = new RecordingOrderNotifier();
  const events = new SynchronousEventPublisher();
  const confirmation = new SendOrderConfirmationWhenOrderPlaced(notifier);
  events.subscribe(OrderPlaced, (event) => confirmation.handle(event));
  const clock = new FixedClock(new Date('2026-11-07T09:30:00Z'));
  const app = buildApp({
    placeOrder: new PlaceOrderHandler(orders, catalog, new EbookPurchasePolicy(orders), clock, events),
    reader: new InMemoryOrderSummaryReader(orders),
  });

  const headers = { 'x-customer-id': 'c1' };
  const created = await app.inject({ method: 'POST', url: '/orders', headers, payload: { ebookIds: ['e1'] } });
  assert.equal(created.statusCode, 201);
  assert.equal(notifier.sent.length, 1);

  const empty = await app.inject({ method: 'POST', url: '/orders', headers, payload: { ebookIds: [] } });
  assert.equal(empty.statusCode, 400);
  const unknown = await app.inject({ method: 'POST', url: '/orders', headers, payload: { ebookIds: ['zzz'] } });
  assert.equal(unknown.statusCode, 422);
  assert.equal((await app.inject({ method: 'GET', url: '/orders' })).statusCode, 401);

  const list = await app.inject({ method: 'GET', url: '/orders', headers });
  assert.equal(list.json<unknown[]>().length, 1);
  await app.close();
});
