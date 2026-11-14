import type { Pool } from 'pg';
import type { OrderSummary } from '../../application/query/order-summary.js';
import type { OrderSummaryReader } from '../../application/query/order-summary-reader.js';
import { formatPlacedAt } from '../format-placed-at.js';

interface SummaryRow {
  id: string;
  status: string;
  placed_at: Date;
  total_amount: string; // SUM(bigint) là numeric: driver pg trả về string
  currency: string;
  titles: string[];
}

/** Phía đọc: query thẳng ra read model, không dựng aggregate. */
export class PgOrderSummaryReader implements OrderSummaryReader {
  constructor(private readonly pool: Pool) {}

  async forCustomer(customerId: string): Promise<readonly OrderSummary[]> {
    const result = await this.pool.query<SummaryRow>(
      `SELECT o.id, o.status, o.placed_at,
              SUM(l.price_amount)                    AS total_amount,
              MIN(l.price_currency)                  AS currency,
              array_agg(l.title ORDER BY l.position) AS titles
         FROM orders o
         JOIN order_lines l ON l.order_id = o.id
        WHERE o.customer_id = $1
        GROUP BY o.id
        ORDER BY o.placed_at DESC`,
      [customerId],
    );
    return result.rows.map((r) => ({
      orderId: r.id,
      status: r.status,
      totalAmount: Number(r.total_amount),
      currency: r.currency,
      titles: r.titles,
      placedAt: formatPlacedAt(r.placed_at),
    }));
  }
}
