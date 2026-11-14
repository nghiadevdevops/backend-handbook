import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/money.ts';

// Fixed seed so a failure re-runs identically. fast-check also prints the seed and the
// shrunk counterexample; drop the seed to explore, then paste the printed one to reproduce.
const config: fc.Parameters<unknown> = { seed: 20261107, numRuns: 200 };

/** Runs the property and turns a failure into a normal assertion that prints seed + shrunk counterexample. */
function holds<T extends unknown[]>(property: fc.IPropertyWithHooks<T>): void {
  const result = fc.check(property, config);

  expect(result.failed, fc.defaultReportMessage(result)).toBe(false);
}

const money = fc.integer({ min: 0, max: 5_000_000 }).map((n) => Money.vnd(n));

describe('Money (properties)', () => {
  it('addition is commutative, associative and has 0 as identity', () => {
    holds(
      fc.property(money, money, money, (a, b, c) => {
        return (
          a.add(b).equals(b.add(a)) &&
          a.add(b).add(c).equals(a.add(b.add(c))) &&
          a.add(Money.vnd(0)).equals(a)
        );
      }),
    );
  });

  it('discount never increases and never goes negative', () => {
    holds(
      fc.property(money, fc.integer({ min: 0, max: 100 }), (m, percent) => {
        const discounted = m.discountPercent(percent);

        return discounted.amount <= m.amount && discounted.amount >= 0;
      }),
    );
  });

  it('multiply equals repeated addition', () => {
    holds(
      fc.property(money, fc.integer({ min: 1, max: 20 }), (m, n) => {
        let sum = Money.vnd(0);
        for (let k = 0; k < n; k++) {
          sum = sum.add(m);
        }

        return m.multiply(n).equals(sum);
      }),
    );
  });
});
