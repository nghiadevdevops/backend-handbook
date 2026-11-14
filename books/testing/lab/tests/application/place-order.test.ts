import { beforeEach, describe, expect, it } from 'vitest';
import { OrderNotFound } from '../../src/application/order-not-found.ts';
import { PlaceOrder } from '../../src/application/place-order.ts';
import { DomainError } from '../../src/domain/domain-error.ts';
import { FixedClock } from '../../src/infrastructure/fixed-clock.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';

describe('PlaceOrder', () => {
  const now = new Date('2026-11-07T08:00:00+00:00');
  let orders: InMemoryOrderRepository;
  let placeOrder: PlaceOrder;

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
    placeOrder = new PlaceOrder(orders, new FixedClock(now));
  });

  it('saves a placed order with all lines', async () => {
    await placeOrder.execute('o-1', 'c-1', [
      { sku: 'A', quantity: 2, unitPrice: 100_000 },
      { sku: 'B', quantity: 1, unitPrice: 50_000 },
    ]);

    const saved = await orders.get('o-1');
    expect(saved.status).toBe('placed');
    expect(saved.placedAt).toEqual(now);
    expect(saved.total().amount).toBe(250_000);
  });

  it('saves nothing when a business rule is violated', async () => {
    await expect(placeOrder.execute('o-2', 'c-1', [])).rejects.toThrow(DomainError);

    await expect(orders.get('o-2')).rejects.toThrow(OrderNotFound);
  });
});
