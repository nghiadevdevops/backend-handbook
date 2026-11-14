import { describe, expect, it, vi } from 'vitest';
import { OrderNotFound } from '../../src/application/order-not-found.ts';
import { PayOrder } from '../../src/application/pay-order.ts';
import type { PaymentGateway } from '../../src/application/ports.ts';
import { DomainError } from '../../src/domain/domain-error.ts';
import { Money } from '../../src/domain/money.ts';
import { FakePaymentGateway } from '../../src/infrastructure/fake-payment-gateway.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';
import { OrderBuilder } from '../support/order-builder.ts';

describe('PayOrder', () => {
  // --- Way 1: fake adapter (check the RESULT at the system boundary) -----

  it('marks order paid when gateway accepts', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
    const gateway = new FakePaymentGateway(true);

    await new PayOrder(orders, gateway).execute('o-1');

    expect((await orders.get('o-1')).status).toBe('paid');
    expect(gateway.charges).toHaveLength(1);
    expect(gateway.charges[0]?.orderId).toBe('o-1');
    expect(gateway.charges[0]?.amount.amount).toBe(100_000);
  });

  it('keeps order placed when gateway declines', async () => {
    const orders = new InMemoryOrderRepository();
    await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
    const declined = new PayOrder(orders, new FakePaymentGateway(false)).execute('o-1');
    await expect(declined).rejects.toThrow(DomainError);
    await expect(declined).rejects.toThrow('Thanh toan bi tu choi');

    expect((await orders.get('o-1')).status).toBe('placed');
  });

  it('fails for unknown order', async () => {
    const useCase = new PayOrder(new InMemoryOrderRepository(), new FakePaymentGateway());

    await expect(useCase.execute('khong-co')).rejects.toThrow(OrderNotFound);
    await expect(useCase.execute('khong-co')).rejects.toThrow('Khong tim thay don khong-co');
  });

  // --- Way 2: mock (check COMMUNICATION with an external boundary) -------
  // Justified because PaymentGateway is an unmanaged dependency: calling it has a real
  // side effect (charging money). The repository still uses the fake, never a mock.

  it('charges gateway exactly once with order total', async () => {
    const orders = new InMemoryOrderRepository();
    const big = OrderBuilder.anOrder()
      .withId('o-6')
      .withoutLines()
      .withLine('B', 1, 1_000_000) // exactly the VIP threshold -> 10% off
      .placed()
      .build();
    await orders.save(big);

    const charge = vi.fn<PaymentGateway['charge']>().mockResolvedValue(true);

    await new PayOrder(orders, { charge }).execute('o-6');

    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith('o-6', Money.vnd(900_000));
  });
});
