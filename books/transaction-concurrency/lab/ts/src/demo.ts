import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { integer, pgTable } from "drizzle-orm/pg-core";
import { isRetryable, withTx } from "./retry.ts";

const acct = pgTable("acct", { id: integer().primaryKey(), bal: integer().notNull() });

const pool = new pg.Pool({ connectionString: process.env.PG_DSN, max: 10 });
const db = drizzle(pool);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function reset() {
  await pool.query("DROP TABLE IF EXISTS acct");
  await pool.query("CREATE TABLE acct(id int PRIMARY KEY, bal int NOT NULL)");
  await pool.query("INSERT INTO acct VALUES (1, 100)");
}
const balance = async () => (await pool.query("SELECT bal FROM acct WHERE id=1")).rows[0].bal as number;

/** Runs the two deposits (+10 now, +20 after 100 ms) concurrently. */
async function both(fn: (amt: number) => Promise<void>) {
  await Promise.all([fn(10), sleep(100).then(() => fn(20))]);
}

// 1. node-postgres: manual transaction, SERIALIZABLE, retry.
await reset();
console.log("== pg: SERIALIZABLE + retry");
await both(async (amt) => {
  const { attempts } = await withTx(pool, "SERIALIZABLE", async (c) => {
    const { rows } = await c.query("SELECT bal FROM acct WHERE id=1");
    await sleep(300);
    await c.query("UPDATE acct SET bal=$1 WHERE id=1", [rows[0].bal + amt]);
  });
  console.log(`deposit +${amt}: attempts=${attempts}`);
});
console.log("final balance =", await balance(), "(expected 130)");

// 2. pg without retry: shows the error code
await reset();
console.log("== pg: SERIALIZABLE, maxAttempts=1");
await both(async (amt) => {
  try {
    await withTx(pool, "SERIALIZABLE", async (c) => {
      const { rows } = await c.query("SELECT bal FROM acct WHERE id=1");
      await sleep(300);
      await c.query("UPDATE acct SET bal=$1 WHERE id=1", [rows[0].bal + amt]);
    }, 1);
    console.log(`deposit +${amt}: ok`);
  } catch (e) {
    console.log(`deposit +${amt}: code=${(e as { code?: string }).code} retryable=${isRetryable(e)}`);
  }
});
console.log("final balance =", await balance());

// 3. pg: FOR UPDATE
await reset();
console.log("== pg: SELECT ... FOR UPDATE");
await both(async (amt) => {
  await withTx(pool, "READ COMMITTED", async (c) => {
    const { rows } = await c.query("SELECT bal FROM acct WHERE id=1 FOR UPDATE");
    await sleep(300);
    await c.query("UPDATE acct SET bal=$1 WHERE id=1", [rows[0].bal + amt]);
  });
});
console.log("final balance =", await balance(), "(expected 130)");

// 4. Drizzle: interactive transaction with isolationLevel + same retry rules.
await reset();
console.log("== drizzle: transaction({ isolationLevel: 'serializable' }) + retry");
async function drizzleDeposit(amt: number): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction(
        async (tx) => {
          const [row] = await tx.select({ bal: acct.bal }).from(acct).where(eq(acct.id, 1));
          await sleep(300);
          await tx.update(acct).set({ bal: row!.bal + amt }).where(eq(acct.id, 1));
        },
        { isolationLevel: "serializable" },
      );
      return attempt;
    } catch (e) {
      if (!isRetryable(e) || attempt >= 5) throw e;
      await sleep(Math.random() * 20 * attempt + 1);
    }
  }
}
await both(async (amt) => console.log(`deposit +${amt}: attempts=${await drizzleDeposit(amt)}`));
console.log("final balance =", await balance(), "(expected 130)");

await pool.end();
