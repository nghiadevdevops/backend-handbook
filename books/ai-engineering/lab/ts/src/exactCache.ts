// Chương 10: exact cache (key gồm tenant và phiên bản prompt/dữ liệu). Store thật thường là Redis/Valkey;
// ở đây dùng Map có TTL để chạy được không cần dịch vụ ngoài.
import { createHash } from "node:crypto";

export interface Cache {
  get(key: string): string | undefined;
  set(key: string, value: string, ttlMs: number): void;
}

export class MemoryCache implements Cache {
  private readonly m = new Map<string, { v: string; exp: number }>();
  get(key: string): string | undefined {
    const e = this.m.get(key);
    if (!e || e.exp < Date.now()) return undefined;
    return e.v;
  }
  set(key: string, value: string, ttlMs: number): void {
    this.m.set(key, { v: value, exp: Date.now() + ttlMs });
  }
}

export function askCacheKey(tenantId: number, promptVersion: string, kbVersion: string, question: string): string {
  const raw = [tenantId, promptVersion, kbVersion, question.trim().toLowerCase()].join("|");
  return "ask:" + createHash("sha256").update(raw).digest("hex");
}

export async function cachedAnswer(
  cache: Cache,
  key: string,
  compute: () => Promise<string>,
  ttlMs = 30 * 60_000,
): Promise<string> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cache.set(key, value, ttlMs);
  return value;
}
