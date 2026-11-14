import type { Redis } from "ioredis";
import { Coalescer } from "./coalesce.ts";
import { tryLock, unlock } from "./lock.ts";

interface Entry<T> {
  v: T;
  freshUntil: number; // ms epoch
}

export interface SwrOptions {
  freshMs: number; // serve straight from cache
  staleMs: number; // after freshMs, still serve but refresh in background
}

export class SwrCache<T> {
  #co = new Coalescer<T>();
  #redis: Redis;
  #opts: SwrOptions;
  constructor(redis: Redis, opts: SwrOptions) {
    this.#redis = redis;
    this.#opts = opts;
  }

  async #load(key: string, loader: () => Promise<T>): Promise<T> {
    const v = await loader();
    const e: Entry<T> = { v, freshUntil: Date.now() + this.#opts.freshMs };
    // physical TTL = fresh + stale window
    await this.#redis.set(key, JSON.stringify(e), "PX", this.#opts.freshMs + this.#opts.staleMs);
    return v;
  }

  async #refresh(key: string, loader: () => Promise<T>): Promise<void> {
    const lk = `lock:${key}`;
    const token = await tryLock(this.#redis, lk, 5000); // one refresher across all processes
    if (!token) return;
    try {
      await this.#co.run(key, () => this.#load(key, loader)); // and one inside this process
    } finally {
      await unlock(this.#redis, lk, token);
    }
  }

  async get(key: string, loader: () => Promise<T>): Promise<T> {
    const raw = await this.#redis.get(key);
    if (raw !== null) {
      const e = JSON.parse(raw) as Entry<T>;
      if (Date.now() >= e.freshUntil) void this.#refresh(key, loader).catch(() => {}); // stale: answer now, refresh later
      return e.v;
    }
    return this.#co.run(key, () => this.#load(key, loader)); // hard miss: callers wait
  }
}
