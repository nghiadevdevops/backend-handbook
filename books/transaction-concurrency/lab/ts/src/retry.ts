import type { Pool, PoolClient } from "pg";

export type Isolation = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

/** SQLSTATE 40001 (serialization failure) or 40P01 (deadlock). 55P03 is not retried. */
export function isRetryable(err: unknown): boolean {
  // Walk the cause chain: ORMs such as Drizzle wrap the driver error.
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const code = (e as { code?: unknown }).code;
    if (code === "40001" || code === "40P01") return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run fn in ONE checked-out connection: BEGIN ISOLATION LEVEL ..., COMMIT/ROLLBACK, release.
 * Retries the whole transaction on 40001/40P01. fn must only touch the DB through `client`
 * (never through `pool`, that would run outside the transaction) and have no outside side effects.
 */
export async function withTx<T>(
  pool: Pool,
  isolation: Isolation,
  fn: (client: PoolClient) => Promise<T>,
  maxAttempts = 5,
): Promise<{ result: T; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await fn(client);
      await client.query("COMMIT");
      client.release(); // success path: give the connection back
      return { result, attempts: attempt };
    } catch (err) {
      // If ROLLBACK itself fails the connection is broken: destroy it instead of returning it to the pool.
      let broken = false;
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      if (broken) client.release(true);
      else client.release();
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      await sleep(Math.random() * 20 * attempt + 1);
      continue;
    }
  }
}
