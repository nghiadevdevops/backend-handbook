import type { Clock } from '../../application/port/out/clock.js';

/** Adapter dành cho test: đồng hồ đứng yên, có thể chỉnh tay. */
export class FixedClock implements Clock {
  #now: Date;

  constructor(now: Date) {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  advanceTo(now: Date): void {
    this.#now = new Date(now);
  }
}
