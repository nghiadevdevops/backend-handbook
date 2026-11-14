// Request coalescing: concurrent callers with the same key share one in-flight Promise.
export class Coalescer<T> {
  #inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }
}
