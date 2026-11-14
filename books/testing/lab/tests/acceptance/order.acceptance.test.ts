import { beforeEach, describe, expect, it } from 'vitest';
import { CancelOrder } from '../../src/application/cancel-order.ts';
import { PayOrder } from '../../src/application/pay-order.ts';
import { PlaceOrder } from '../../src/application/place-order.ts';
import { DomainError } from '../../src/domain/domain-error.ts';
import { FakePaymentGateway } from '../../src/infrastructure/fake-payment-gateway.ts';
import { FixedClock } from '../../src/infrastructure/fixed-clock.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';

/**
 * Each test maps to ONE acceptance criterion in docs/acceptance-criteria.md.
 * The AC code is the prefix of the test name, for traceability and to run one AC alone:
 *   vitest run -t AC-ORD-3
 * Scenarios go through the real use cases + fake adapters, not through HTTP.
 */
describe('Order acceptance', () => {
  const now = new Date('2026-11-07T08:00:00+00:00');
  let orders: InMemoryOrderRepository;

  const placeOrder = () => new PlaceOrder(orders, new FixedClock(now));

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
  });

  it('AC-ORD-1: placing an order with lines marks it placed', async () => {
    // Given a cart with 1 line
    const lines = [{ sku: 'A', quantity: 1, unitPrice: 200_000 }];

    // When the customer places the order
    await placeOrder().execute('o-1', 'c-1', lines);

    // Then the order is "placed" and the placement time is recorded
    const order = await orders.get('o-1');
    expect(order.status).toBe('placed');
    expect(order.placedAt).toEqual(now);
  });

  it('AC-ORD-2: empty cart cannot be placed', async () => {
    // Given an empty cart
    // When the customer places the order
    // Then the system rejects it and saves no order
    await expect(placeOrder().execute('o-2', 'c-1', [])).rejects.toThrow(DomainError);
  });

  it('AC-ORD-3: orders from one million get ten percent off', async () => {
    // Given a cart worth 1,200,000 VND
    const lines = [{ sku: 'TV', quantity: 1, unitPrice: 1_200_000 }];

    // When the customer places the order
    await placeOrder().execute('o-3', 'c-1', lines);

    // Then the total is 1,080,000 VND
    expect((await orders.get('o-3')).total().amount).toBe(1_080_000);
  });

  it('AC-ORD-4: successful payment marks order paid and charges once', async () => {
    // Given a placed order worth 300,000
    await placeOrder().execute('o-4', 'c-1', [{ sku: 'A', quantity: 3, unitPrice: 100_000 }]);
    const gateway = new FakePaymentGateway(true);

    // When the customer pays and the gateway accepts
    await new PayOrder(orders, gateway).execute('o-4');

    // Then the order is "paid" and the gateway was charged exactly once for 300,000
    expect((await orders.get('o-4')).status).toBe('paid');
    expect(gateway.charges).toHaveLength(1);
    expect(gateway.charges[0]?.amount.amount).toBe(300_000);
  });

  it('AC-ORD-5: declined payment leaves order placed', async () => {
    // Given a placed order
    await placeOrder().execute('o-5', 'c-1', [{ sku: 'A', quantity: 1, unitPrice: 100_000 }]);

    // When the gateway declines
    await expect(new PayOrder(orders, new FakePaymentGateway(false)).execute('o-5')).rejects.toThrow(
      DomainError,
    );

    // Then the order is still "placed"
    expect((await orders.get('o-5')).status).toBe('placed');
  });

  it('AC-ORD-6: paid order cannot be cancelled', async () => {
    // Given a paid order
    await placeOrder().execute('o-6', 'c-1', [{ sku: 'A', quantity: 1, unitPrice: 100_000 }]);
    await new PayOrder(orders, new FakePaymentGateway()).execute('o-6');

    // When the customer cancels
    // Then it is rejected
    await expect(new CancelOrder(orders).execute('o-6')).rejects.toThrow(DomainError);
  });
});
