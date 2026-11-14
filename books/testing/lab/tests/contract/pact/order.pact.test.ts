import path from 'node:path';
import { MatchersV3, PactV4, Verifier } from '@pact-foundation/pact';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/http/app.ts';
import { FakePaymentGateway } from '../../../src/infrastructure/fake-payment-gateway.ts';
import { FixedClock } from '../../../src/infrastructure/fixed-clock.ts';
import { HttpOrderClient } from '../../../src/infrastructure/http-order-client.ts';
import { InMemoryOrderRepository } from '../../../src/infrastructure/in-memory-order-repository.ts';
import { OrderBuilder } from '../../support/order-builder.ts';

const { like, integer, string, eachLike } = MatchersV3;

const PACT_DIR = path.resolve(process.cwd(), 'pacts');
const TOKEN = 'test-token';

// One file on purpose: the provider step reads the pact file the consumer step writes,
// and tests inside one file run in order (separate files would run in parallel).
describe('Pact: web-shop (consumer) -> order-service (provider)', () => {
  it('consumer: HttpOrderClient can read a placed order (writes the pact file)', async () => {
    const pact = new PactV4({ consumer: 'web-shop', provider: 'order-service', dir: PACT_DIR });

    await pact
      .addInteraction()
      .given('order o-1 is placed')
      .uponReceiving('a request for order o-1')
      .withRequest('GET', '/orders/o-1', (b) => {
        b.headers({ authorization: `Bearer ${TOKEN}` });
      })
      .willRespondWith(200, (b) => {
        b.jsonBody({
          id: like('o-1'),
          status: like('placed'),
          total: integer(100_000),
          currency: string('VND'),
          lines: eachLike({ sku: string('SKU-1'), quantity: integer(1), unitPrice: integer(100_000) }),
        });
      })
      .executeTest(async (mockServer) => {
        // The REAL consumer client code runs against the mock server.
        const order = await new HttpOrderClient(mockServer.url, TOKEN).get('o-1');

        expect(order.status).toBe('placed');
        expect(order.total).toBe(100_000);
      });
  });

  it('provider: the real Fastify app satisfies the pact (stubbing only DB and gateway)', async () => {
    const orders = new InMemoryOrderRepository();
    const app = buildApp({
      orders,
      payments: new FakePaymentGateway(true),
      clock: new FixedClock(new Date('2026-11-07T08:00:00+00:00')),
      apiToken: TOKEN,
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      // verifyProvider() rejects with the mismatch report when the pact is not satisfied.
      await expect(
        new Verifier({
          provider: 'order-service',
          providerBaseUrl: baseUrl,
          pactUrls: [path.join(PACT_DIR, 'web-shop-order-service.json')],
          stateHandlers: {
            // Provider state: prepare the precondition the consumer declared with given().
            'order o-1 is placed': async () => {
              await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
            },
          },
          logLevel: 'warn',
        }).verifyProvider(),
      ).resolves.toBeDefined();
    } finally {
      await app.close();
    }
  });
});
