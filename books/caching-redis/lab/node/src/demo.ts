import { Redis } from "ioredis";
import { Coalescer } from "./coalesce.ts";
import { SwrCache } from "./swr.ts";

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fake "database": counts calls and takes 200 ms. Not a real PostgreSQL.
let dbCalls = 0;
async function loadProduct(): Promise<string> {
  dbCalls++;
  await sleep(200);
  return "Book 42|47.00";
}

async function stampede(label: string, coalesce: boolean): Promise<void> {
  await redis.del("product:42");
  dbCalls = 0;
  const co = new Coalescer<string>();
  const get = async (): Promise<string> => {
    const hit = await redis.get("product:42");
    if (hit !== null) return hit;
    const load = async () => {
      const v = await loadProduct();
      await redis.set("product:42", v, "EX", 60);
      return v;
    };
    return coalesce ? co.run("product:42", load) : load();
  };
  await Promise.all(Array.from({ length: 100 }, get));
  console.log(`${label}: 100 concurrent misses -> db calls = ${dbCalls}`);
}

await stampede("naive    ", false);
await stampede("coalesced", true);

// stale-while-revalidate: fresh 300 ms, stale 2000 ms
await redis.del("product:7");
dbCalls = 0;
const swr = new SwrCache<string>(redis, { freshMs: 300, staleMs: 2000 });
const t0 = Date.now();
const lat: string[] = [];
for (let i = 0; i < 10; i++) {
  const t = Date.now();
  await swr.get("product:7", loadProduct);
  lat.push(`${Date.now() - t}ms`);
  await sleep(100);
}
console.log(`swr: 10 reads over ~${Date.now() - t0}ms, per-read latency = ${lat.join(" ")}, db calls = ${dbCalls}`);
await sleep(300);
await redis.del("product:7");
redis.disconnect();
