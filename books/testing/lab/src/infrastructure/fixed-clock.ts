import type { Clock } from '../application/ports.ts';

export class FixedClock implements Clock {
  readonly #now: Date;

  constructor(now: Date) {
    this.#now = now;
  }

  now(): Date {
    return new Date(this.#now);
  }
}
