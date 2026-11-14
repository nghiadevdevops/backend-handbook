import pg from 'pg';
import { OrderNotFound } from '../application/order-not-found.ts';
import type { OrderRepository } from '../application/ports.ts';
import { Money } from '../domain/money.ts';
import { Order } from '../domain/order.ts';
import { OrderLine } from '../domain/order-line.ts';
import { ORDER_STATUSES, type OrderStatus } from '../domain/order-status.ts';

interface OrderRow {
  id: string;
  customer_id: string;
  status: string;
  placed_at: Date | null;
}

interface LineRow {
  sku: string;
  quantity: number;
  unit_price: string; // bigint comes back from `pg` as a string
}

function toStatus(value: string): OrderStatus {
  const status = ORDER_STATUSES.find((s) => s === value);
  if (status === undefined) {
    throw new Error(`Trang thai la trong DB: ${value}`);
  }

  return status;
}

/**
 * Real adapter: `pg` + PostgreSQL.
 *
 * Pass a `Pool` in production (save() opens and commits its own transaction), or a
 * `PoolClient` that already did BEGIN (a test rolling back): then save() joins that transaction.
 */
export class PostgresOrderRepository implements OrderRepository {
  readonly #db: pg.Pool | pg.PoolClient;

  constructor(db: pg.Pool | pg.PoolClient) {
    this.#db = db;
  }

  async save(order: Order): Promise<void> {
    const own = this.#db instanceof pg.Pool;
    const client = this.#db instanceof pg.Pool ? await this.#db.connect() : this.#db;

    try {
      if (own) {
        await client.query('BEGIN');
      }

      await client.query(
        `INSERT INTO orders (id, customer_id, status, placed_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET status = EXCLUDED.status, placed_at = EXCLUDED.placed_at`,
        [order.id, order.customerId, order.status, order.placedAt],
      );
      await client.query('DELETE FROM order_lines WHERE order_id = $1', [order.id]);

      let position = 0;
      for (const line of order.lines) {
        await client.query(
          `INSERT INTO order_lines (order_id, position, sku, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, position++, line.sku, line.quantity, line.unitPrice.amount],
        );
      }

      if (own) {
        await client.query('COMMIT');
      }
    } catch (error) {
      if (own) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (own && 'release' in client) {
        client.release();
      }
    }
  }

  async get(id: string): Promise<Order> {
    const orders = await this.#db.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    const row = orders.rows[0];
    if (row === undefined) {
      throw OrderNotFound.withId(id);
    }

    const lines = await this.#db.query<LineRow>(
      'SELECT sku, quantity, unit_price FROM order_lines WHERE order_id = $1 ORDER BY position',
      [id],
    );

    return Order.reconstitute(
      row.id,
      row.customer_id,
      toStatus(row.status),
      row.placed_at,
      lines.rows.map((r) => new OrderLine(r.sku, r.quantity, Money.vnd(Number(r.unit_price)))),
    );
  }
}
