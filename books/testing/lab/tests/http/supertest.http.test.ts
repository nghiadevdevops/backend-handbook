import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { FakePaymentGateway } from '../../src/infrastructure/fake-payment-gateway.ts';
import { FixedClock } from '../../src/infrastructure/fixed-clock.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';

/**
 * The same boundary through Supertest. Unlike `app.inject()`, Supertest talks to a real
 * `http.Server` (on an ephemeral port bound inside the test process). It works with any
 * framework that exposes a Node server (Express, Koa, Fastify), which is its main advantage.
 */
describe('orders over HTTP (Supertest)', () => {
  const app = buildApp({
    orders: new InMemoryOrderRepository(),
    payments: new FakePaymentGateway(true),
    clock: new FixedClock(new Date('2026-11-07T08:00:00+00:00')),
    apiToken: 'test-token',
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('places then reads an order', async () => {
    const body = { id: 'st-1', customerId: 'c-1', lines: [{ sku: 'TV', quantity: 1, unitPrice: 1_200_000 }] };

    await request(app.server)
      .post('/orders')
      .set('authorization', 'Bearer test-token')
      .send(body)
      .expect(201)
      .expect('content-type', /application\/json/);

    const res = await request(app.server).get('/orders/st-1').set('authorization', 'Bearer test-token').expect(200);
    expect(res.body).toMatchObject({ id: 'st-1', status: 'placed', total: 1_080_000 });
  });

  it('answers 401 without a token', async () => {
    // Supertest's own .expect() is not counted by Vitest's requireAssertions, so assert with expect().
    const res = await request(app.server).get('/orders/st-1');

    expect(res.status).toBe(401);
  });
});
