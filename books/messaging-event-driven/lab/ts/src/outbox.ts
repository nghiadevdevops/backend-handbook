// Chương 7: dual write (sai) và transactional outbox (đúng) bằng node-postgres.
import pg from "pg";

type OrderPlaced = { order_id: number; customer_id: string; total_cents: number };

// SAI: hai hệ thống, hai bước. Crash giữa (1) và (2) thì mất event.
export async function placeOrderDualWrite(
  pool: pg.Pool,
  publish: (topic: string, key: string, value: OrderPlaced) => Promise<void>,
  customerId: string,
  totalCents: number,
): Promise<void> {
  const { rows } = await pool.query(
    "INSERT INTO orders(customer_id,total_cents) VALUES ($1,$2) RETURNING id",
    [customerId, totalCents],
  ); // 1. write DB
  await publish("orders", String(rows[0].id), {
    order_id: rows[0].id, customer_id: customerId, total_cents: totalCents,
  }); // 2. publish
}

// ĐÚNG: order và outbox cùng một transaction; relay publish sau.
export async function placeOrderWithOutbox(
  pool: pg.Pool,
  customerId: string,
  totalCents: number,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO orders(customer_id,total_cents) VALUES ($1,$2) RETURNING id",
      [customerId, totalCents],
    );
    const id: number = rows[0].id;
    await client.query(
      "INSERT INTO outbox(aggregate_id,event_type,payload) VALUES ($1,'OrderPlaced',$2)",
      [String(id), JSON.stringify({ order_id: id, customer_id: customerId, total_cents: totalCents })],
    );
    await client.query("COMMIT");
    return id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
