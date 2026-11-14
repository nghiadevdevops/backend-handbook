import type { Pool } from 'pg';
import { EbookId } from '../../domain/catalog/ebook-id.js';
import { CustomerId } from '../../domain/order/customer-id.js';
import { OrderNotFound } from '../../domain/order/errors.js';
import { Order } from '../../domain/order/order.js';
import { OrderId } from '../../domain/order/order-id.js';
import { OrderLine } from '../../domain/order/order-line.js';
import type { OrderRepository } from '../../domain/order/order-repository.js';
import { parseOrderStatus } from '../../domain/order/order-status.js';
import { Money } from '../../domain/shared/money.js';

interface OrderRow {
  customer_id: string;
  status: string;
  placed_at: Date;
  paid_at: Date | null;
}

interface LineRow {
  ebook_id: string;
  title: string;
  price_amount: string; // bigint: driver pg trả về string
  price_currency: string;
}

/** Adapter persistence-oriented: save() ghi cả aggregate (đơn + các dòng) trong một transaction. */
export class PgOrderRepository implements OrderRepository {
  constructor(private readonly pool: Pool) {}

  nextIdentity(): OrderId {
    return OrderId.generate();
  }

  async save(order: Order): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO orders (id, customer_id, status, placed_at, paid_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
           SET customer_id = EXCLUDED.customer_id, status = EXCLUDED.status,
               placed_at = EXCLUDED.placed_at, paid_at = EXCLUDED.paid_at`,
        [order.id, order.customerId, order.status, order.placedAt, order.paidAt],
      );
      await client.query('DELETE FROM order_lines WHERE order_id = $1', [order.id]);
      for (const [position, line] of order.lines.entries()) {
        await client.query(
          `INSERT INTO order_lines (order_id, position, ebook_id, title, price_amount, price_currency)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, position, line.ebookId, line.title, line.price.amount, line.price.currency],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id: OrderId): Promise<Order> {
    const orderResult = await this.pool.query<OrderRow>(
      'SELECT customer_id, status, placed_at, paid_at FROM orders WHERE id = $1',
      [id],
    );
    const row = orderResult.rows[0];
    if (row === undefined) {
      throw OrderNotFound.withId(id);
    }

    const lineResult = await this.pool.query<LineRow>(
      'SELECT ebook_id, title, price_amount, price_currency FROM order_lines WHERE order_id = $1 ORDER BY position',
      [id],
    );
    const lines = lineResult.rows.map(
      (r) => new OrderLine(EbookId.of(r.ebook_id), r.title, Money.of(Number(r.price_amount), r.price_currency)),
    );

    return Order.reconstitute(id, CustomerId.of(row.customer_id), lines, parseOrderStatus(row.status), row.placed_at, row.paid_at);
  }

  async customerHasPaidFor(customerId: CustomerId, ebookId: EbookId): Promise<boolean> {
    const result = await this.pool.query<{ paid: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM orders o JOIN order_lines l ON l.order_id = o.id
         WHERE o.customer_id = $1 AND o.status = 'paid' AND l.ebook_id = $2
       ) AS paid`,
      [customerId, ebookId],
    );
    return result.rows[0]?.paid === true;
  }
}
