import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import type { OrderSummary } from '../src/application/query/order-summary.js';
import { BookshopModule } from '../src/nest/bookshop.module.js';
import { configureApp } from '../src/nest/configure-app.js';
import { PG_POOL } from '../src/nest/tokens.js';

// Module NestJS thật, không override gì: adapter PostgreSQL + EventEmitter + SystemClock.
const skip = process.env['DATABASE_URL'] === undefined;

describe('NestJS + PostgreSQL (không override provider)', { skip }, () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [BookshopModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const pool = app.get<Pool>(PG_POOL);
    await pool.query('DROP TABLE IF EXISTS order_lines, orders, ebooks');
    await pool.query(await readFile('db/schema.sql', 'utf8'));
    await pool.query("INSERT INTO ebooks VALUES ('ddd-101', 'DDD nhập môn', 120000, 'VND'), ('hexa-201', 'Kiến trúc lục giác', 95000, 'VND')");
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  after(async () => {
    await app.close();
  });

  test('đặt đơn rồi đọc lại qua read model', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-customer-id': 'cus-1' },
      body: JSON.stringify({ ebookIds: ['ddd-101', 'hexa-201'] }),
    });
    assert.equal(response.status, 201);

    const list = await fetch(`${baseUrl}/orders`, { headers: { 'x-customer-id': 'cus-1' } });
    const summaries = (await list.json()) as OrderSummary[];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.totalAmount, 215000);
    assert.deepEqual(summaries[0]?.titles, ['DDD nhập môn', 'Kiến trúc lục giác']);
  });
});
