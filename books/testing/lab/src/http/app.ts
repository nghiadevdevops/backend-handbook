import Fastify, { type FastifyInstance } from 'fastify';
import { CancelOrder } from '../application/cancel-order.ts';
import { OrderNotFound } from '../application/order-not-found.ts';
import { presentOrder } from '../application/order-presenter.ts';
import { PayOrder } from '../application/pay-order.ts';
import { PlaceOrder, type LineInput } from '../application/place-order.ts';
import type { Clock, OrderRepository, PaymentGateway } from '../application/ports.ts';
import { DomainError } from '../domain/domain-error.ts';
import { CART_PAGE } from './cart-page.ts';

export interface AppDeps {
  orders: OrderRepository;
  payments: PaymentGateway;
  clock: Clock;
  /** Bearer token accepted by the /orders routes. */
  apiToken: string;
}

interface PlaceBody {
  id: string;
  customerId: string;
  lines: LineInput[];
}

const placeBodySchema = {
  type: 'object',
  required: ['id', 'customerId', 'lines'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    customerId: { type: 'string', minLength: 1 },
    lines: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['sku', 'quantity', 'unitPrice'],
        properties: {
          sku: { type: 'string', minLength: 1 },
          quantity: { type: 'integer', minimum: 1 },
          unitPrice: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
} as const;

/**
 * Driving adapter. It only validates input, calls a use case, and maps the result or
 * exception to HTTP. Business rules live in the layers below.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  // Fastify's Ajv coerces types by default ("2" becomes 2). A JSON API should reject that.
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false } } });
  const placeOrder = new PlaceOrder(deps.orders, deps.clock);
  const payOrder = new PayOrder(deps.orders, deps.payments);
  const cancelOrder = new CancelOrder(deps.orders);

  // Error mapping: the domain does not know HTTP.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OrderNotFound) {
      return reply.code(404).send({ error: error.message });
    }
    if (error instanceof DomainError) {
      return reply.code(409).send({ error: error.message });
    }
    return reply.send(error);
  });

  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(CART_PAGE));

  app.register(async (api) => {
    api.addHook('onRequest', async (request, reply) => {
      if (request.headers.authorization !== `Bearer ${deps.apiToken}`) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });

    api.post<{ Body: PlaceBody }>('/orders', { schema: { body: placeBodySchema } }, async (request, reply) => {
      const { id, customerId, lines } = request.body;
      await placeOrder.execute(id, customerId, lines);

      return reply.code(201).send(presentOrder(await deps.orders.get(id)));
    });

    api.get<{ Params: { id: string } }>('/orders/:id', async (request) =>
      presentOrder(await deps.orders.get(request.params.id)),
    );

    api.post<{ Params: { id: string } }>('/orders/:id/pay', async (request) => {
      await payOrder.execute(request.params.id);

      return presentOrder(await deps.orders.get(request.params.id));
    });

    api.post<{ Params: { id: string } }>('/orders/:id/cancel', async (request) => {
      await cancelOrder.execute(request.params.id);

      return presentOrder(await deps.orders.get(request.params.id));
    });
  });

  return app;
}
