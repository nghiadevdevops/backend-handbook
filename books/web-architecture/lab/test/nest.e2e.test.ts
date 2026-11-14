import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PayOrderUseCase } from '../src/application/port/in/pay-order-use-case.js';
import type { OrderSummary } from '../src/application/query/order-summary.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { Money } from '../src/domain/shared/money.js';
import { InMemoryEbookCatalog } from '../src/infrastructure/in-memory/in-memory-ebook-catalog.js';
import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { InMemoryOrderSummaryReader } from '../src/infrastructure/in-memory/in-memory-order-summary-reader.js';
import { RecordingOrderNotifier } from '../src/infrastructure/in-memory/recording-order-notifier.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';
import { BookshopModule } from '../src/nest/bookshop.module.js';
import { configureApp } from '../src/nest/configure-app.js';
import {
  CLOCK,
  EBOOK_CATALOG,
  ORDER_NOTIFIER,
  ORDER_REPOSITORY,
  ORDER_SUMMARY_READER,
  PAY_ORDER_USE_CASE,
} from '../src/nest/tokens.js';

describe('NestJS: controller, DI token, ValidationPipe và event', () => {
  let app: INestApplication;
  let baseUrl: string;
  const notifier = new RecordingOrderNotifier();

  before(async () => {
    const orders = new InMemoryOrderRepository();
    const catalog = new InMemoryEbookCatalog();
    catalog.add(new Ebook(EbookId.of('e1'), 'Sách 1', Money.vnd(100)));
    catalog.add(new Ebook(EbookId.of('e2'), 'Sách 2', Money.vnd(250)));

    // Thay adapter thật bằng InMemory ngay trong container, như test feature của framework.
    const moduleRef = await Test.createTestingModule({ imports: [BookshopModule] })
      .overrideProvider(ORDER_REPOSITORY)
      .useValue(orders)
      .overrideProvider(EBOOK_CATALOG)
      .useValue(catalog)
      .overrideProvider(ORDER_SUMMARY_READER)
      .useValue(new InMemoryOrderSummaryReader(orders))
      .overrideProvider(ORDER_NOTIFIER)
      .useValue(notifier)
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(new Date('2026-11-07T09:30:00Z')))
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  after(async () => {
    await app.close();
  });

  const post = (body: unknown, customer: string | null = 'c1') =>
    fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(customer === null ? {} : { 'x-customer-id': customer }) },
      body: JSON.stringify(body),
    });

  test('POST /orders hợp lệ trả 201, listener qua @OnEvent gọi notifier', async () => {
    const response = await post({ ebookIds: ['e1', 'e2'] });
    assert.equal(response.status, 201);
    const { orderId } = (await response.json()) as { orderId: string };
    assert.match(orderId, /^[0-9a-f-]{36}$/);
    assert.equal(notifier.sent.length, 1);
    assert.match(notifier.sent[0] ?? '', /350 VND/);
  });

  test('ValidationPipe chặn body sai hình dạng bằng 400', async () => {
    assert.equal((await post({ ebookIds: [] })).status, 400);
    assert.equal((await post({ ebookIds: ['e1', 'e1'] })).status, 400);
    assert.equal((await post({ ebookIds: [1] })).status, 400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ ebookIds: ['e1'], extra: true })).status, 400);
  });

  test('Thiếu danh tính trả 401', async () => {
    assert.equal((await post({ ebookIds: ['e1'] }, null)).status, 401);
  });

  test('Luật nghiệp vụ vi phạm trả 422 (e-book không tồn tại)', async () => {
    const response = await post({ ebookIds: ['khong-co'] }, 'c3');
    assert.equal(response.status, 422);
  });

  test('Không mua lại sách đã trả tiền: 422, và GET /orders trả read model', async () => {
    const created = await post({ ebookIds: ['e1'] }, 'c2');
    const { orderId } = (await created.json()) as { orderId: string };
    await app.get<PayOrderUseCase>(PAY_ORDER_USE_CASE).handle({ orderId, paymentReference: 'PAY-1' });

    const again = await post({ ebookIds: ['e1'] }, 'c2');
    assert.equal(again.status, 422);
    assert.match(JSON.stringify(await again.json()), /đã mua/);

    const list = await fetch(`${baseUrl}/orders`, { headers: { 'x-customer-id': 'c2' } });
    const summaries = (await list.json()) as OrderSummary[];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.status, 'paid');
  });
});
