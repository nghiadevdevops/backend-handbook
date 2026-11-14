import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderNotFound } from '../../src/application/order-not-found.ts';
import { Money } from '../../src/domain/money.ts';
import { PostgresOrderRepository } from '../../src/infrastructure/postgres-order-repository.ts';
import { OrderBuilder } from '../support/order-builder.ts';

/**
 * Integration test of the adapter against a REAL PostgreSQL.
 * Each test runs inside one transaction and ROLLBACKs in afterEach -> the DB stays clean.
 * The connection string comes from DATABASE_URL (run.sh sets it; no default on purpose).
 */
const url = process.env['DATABASE_URL'];
if (url === undefined) {
  throw new Error('Thieu bien moi truong DATABASE_URL (chay qua ./run.sh integ)');
}

describe('PostgresOrderRepository', () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  let client: pg.PoolClient;
  let repo: PostgresOrderRepository;

  beforeAll(async () => {
    await pool.query(await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    repo = new PostgresOrderRepository(client);
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  it('round trips an order with lines', async () => {
    const order = OrderBuilder.anOrder().withId('it-1').withLine('SKU-2', 3, 25_000).placed().build();

    await repo.save(order);
    const loaded = await repo.get('it-1');

    expect(loaded.id).toBe('it-1');
    expect(loaded.status).toBe('placed');
    expect(loaded.placedAt).toEqual(order.placedAt);
    expect(loaded.lines).toHaveLength(2);
    expect(loaded.lines[1]?.sku).toBe('SKU-2');
    expect(loaded.total().equals(Money.vnd(175_000))).toBe(true);
  });

  it('reads bigint unit_price back as a number (pg returns bigint as string)', async () => {
    const order = OrderBuilder.anOrder().withId('it-big').withoutLines().withLine('GOLD', 1, 3_000_000_000).build();

    await repo.save(order);

    expect((await repo.get('it-big')).lines[0]?.unitPrice.amount).toBe(3_000_000_000);
  });

  it('saving again updates status and replaces lines', async () => {
    const order = OrderBuilder.anOrder().withId('it-2').withLine('SKU-2', 1, 10_000).placed().build();
    await repo.save(order);

    order.markPaid();
    await repo.save(order);

    const loaded = await repo.get('it-2');
    expect(loaded.status).toBe('paid');
    expect(loaded.lines, 'Luu lai khong duoc nhan doi dong').toHaveLength(2);
  });

  it('draft order has null placedAt', async () => {
    await repo.save(OrderBuilder.anOrder().withId('it-3').build());

    expect((await repo.get('it-3')).placedAt).toBeNull();
  });

  it('unknown id raises not found', async () => {
    await expect(repo.get('khong-ton-tai')).rejects.toThrow(OrderNotFound);
  });

  it('database enforces the status check constraint', async () => {
    // A DB constraint is part of the contract that only a real DB can verify.
    await expect(
      client.query("INSERT INTO orders (id, customer_id, status) VALUES ('bad', 'c', 'weird')"),
    ).rejects.toThrow(/orders_status_check/);
  });
});

describe('PostgresOrderRepository owning its transaction (Pool)', () => {
  const pool = new pg.Pool({ connectionString: url, max: 2 });

  afterAll(async () => {
    await pool.query("DELETE FROM orders WHERE id LIKE 'own-%'");
    await pool.end();
  });

  it('commits for real when given a Pool', async () => {
    const repo = new PostgresOrderRepository(pool);

    await repo.save(OrderBuilder.anOrder().withId('own-1').placed().build());

    // A different connection must see the committed data.
    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', ['own-1']);
    expect(rows).toEqual([{ status: 'placed' }]);
  });
});
