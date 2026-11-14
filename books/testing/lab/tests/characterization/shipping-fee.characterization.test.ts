import { describe, expect, it } from 'vitest';
import { presentOrder } from '../../src/application/order-presenter.ts';
import { calcShippingFee } from '../../src/legacy/shipping-fee.ts';
import { OrderBuilder } from '../support/order-builder.ts';

/**
 * Characterization test: the numbers come from RUNNING the real code,
 * not from a spec. The goal is to detect behaviour changes during refactoring.
 */
describe('calcShippingFee (legacy)', () => {
  it.each([
    ['light, inner city HN', 300, 'HN', false, 10_000],
    ['exactly 500g, other province', 500, 'OTHER', false, 15_000],
    ['501g jumps one step', 501, 'OTHER', false, 20_000],
    ['1000g, HCM', 1000, 'HCM', false, 20_000],
    ['island multiplies by 3', 300, 'ISLAND', false, 45_000],
    ['express multiplies by 1.5', 300, 'HN', true, 15_000],
    ['express rounds', 750, 'OTHER', true, 30_000],
    ['over 20kg is 0', 20_001, 'HN', false, 0],
  ])('pins current behaviour: %s', (_name, grams, zone, express, expected) => {
    expect(calcShippingFee(grams, zone, express)).toBe(expected);
  });
});

describe('order JSON (snapshot / approval)', () => {
  /** Compares the output with an "approved" file that a human reviewed. */
  it('matches the approved snapshot', async () => {
    const order = OrderBuilder.anOrder().withId('snap-1').withLine('SKU-2', 2, 30_000).placed().build();

    const actual = JSON.stringify(presentOrder(order), null, 2) + '\n';

    await expect(actual).toMatchFileSnapshot('./approved/order-response.approved.json');
  });
});
