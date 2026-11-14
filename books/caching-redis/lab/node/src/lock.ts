import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

const UNLOCK = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

// SET key token NX PX ttl. Returns the token if we got the lock, otherwise null.
export async function tryLock(redis: Redis, key: string, ttlMs: number): Promise<string | null> {
  const token = randomBytes(16).toString("hex");
  const ok = await redis.set(key, token, "PX", ttlMs, "NX");
  return ok === "OK" ? token : null;
}

// Delete only if we still own the lock (compare token and DEL atomically in Lua).
export async function unlock(redis: Redis, key: string, token: string): Promise<boolean> {
  return (await redis.eval(UNLOCK, 1, key, token)) === 1;
}
