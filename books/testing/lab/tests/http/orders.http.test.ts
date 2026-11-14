import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { FakePaymentGateway } from '../../src/infrastructure/fake-payment-gateway.ts';
import { FixedClock } from '../../src/infrastructure/fixed-clock.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';
import { OrderBuilder } from '../support/order-builder.ts';

/**
 * HTTP-boundary tests with Fastify's built-in `app.inject()`: the whole request pipeline
 * (routing, hooks, validation, serialization, error handler) runs in-process, no TCP port.
 * Business rules are NOT re-tested here (thresholds, max lines...): only HTTP concerns.
 */
const AUTH = { authorization: 'Bearer test-token' };

describe('orders over HTTP', () => {
  let orders: InMemoryOrderRepository;
  let gateway: FakePaymentGateway;
  let app: FastifyInstance;

  const makeApp = (payments: FakePaymentGateway) =>
    buildApp({
      orders,
      payments,
      clock: new FixedClock(new Date('2026-11-07T08:00:00+00:00')),
      apiToken: 'test-token',
    });

  beforeEach(async () => {
    orders = new InMemoryOrderRepository();
    gateway = new FakePaymentGateway(true);
    app = makeApp(gateway);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /orders places an order and returns 201 with the contract shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: AUTH,
      payload: { id: 'o-1', customerId: 'c-1', lines: [{ sku: 'A', quantity: 2, unitPrice: 100_000 }] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: 'o-1',
      status: 'placed',
      total: 200_000,
      currency: 'VND',
      lines: [{ sku: 'A', quantity: 2, unitPrice: 100_000 }],
    });
  });

  it('rejects an empty cart with 400 and names the field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: AUTH,
      payload: { id: 'o-2', customerId: 'c-1', lines: [] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('body/lines');
  });

  it('rejects a body with a wrong type with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: AUTH,
      payload: { id: 'o-2', customerId: 'c-1', lines: [{ sku: 'A', quantity: '2', unitPrice: 1 }] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('maps a domain error to 409', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ sku: `S${i}`, quantity: 1, unitPrice: 1_000 }));

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: AUTH,
      payload: { id: 'o-3', customerId: 'c-1', lines: six },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Don toi da 5 dong' });
  });

  it('maps OrderNotFound to 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/orders/khong-co', headers: AUTH });

    expect(res.statusCode).toBe(404);
  });

  it('requires the bearer token on every /orders route', async () => {
    expect((await app.inject({ method: 'POST', url: '/orders', payload: {} })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/orders/o-1', headers: { authorization: 'Bearer wrong' } })).statusCode,
    ).toBe(401);
  });

  it('pays an order through the fake gateway wired at the boundary', async () => {
    await orders.save(OrderBuilder.anOrder().withId('o-4').placed().build());

    const res = await app.inject({ method: 'POST', url: '/orders/o-4/pay', headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('paid');
    expect(gateway.charges).toHaveLength(1);
  });

  it('maps a declined payment to 409 and leaves the order placed', async () => {
    await orders.save(OrderBuilder.anOrder().withId('o-5').placed().build());
    const declining = makeApp(new FakePaymentGateway(false));

    const res = await declining.inject({ method: 'POST', url: '/orders/o-5/pay', headers: AUTH });

    expect(res.statusCode).toBe(409);
    expect((await orders.get('o-5')).status).toBe('placed');
    await declining.close();
  });
});
