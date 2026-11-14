import Fastify, { type FastifyInstance } from 'fastify';
import type { PlaceOrderUseCase } from '../application/port/in/place-order-use-case.js';
import type { OrderSummaryReader } from '../application/query/order-summary-reader.js';
import { DomainRuleViolation } from '../domain/shared/errors.js';

export interface Dependencies {
  readonly placeOrder: PlaceOrderUseCase;
  readonly reader: OrderSummaryReader;
}

const placeOrderSchema = {
  body: {
    type: 'object',
    required: ['ebookIds'],
    additionalProperties: false,
    properties: {
      ebookIds: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        items: { type: 'string', minLength: 1, maxLength: 64 },
      },
    },
  },
} as const;

/**
 * Adapter HTTP viết tay: không có DI container, dependency đi vào qua tham số hàm.
 * Validate bằng JSON Schema có sẵn của Fastify.
 */
export function buildApp({ placeOrder, reader }: Dependencies): FastifyInstance {
  const app = Fastify();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainRuleViolation) {
      return reply.status(422).send({ statusCode: 422, message: error.message });
    }
    return reply.send(error);
  });

  const customerOf = (header: string | string[] | undefined): string | undefined =>
    typeof header === 'string' && header.trim() !== '' ? header : undefined;

  app.get('/orders', async (request, reply) => {
    const customerId = customerOf(request.headers['x-customer-id']);
    if (customerId === undefined) return reply.status(401).send({ message: 'Thiếu danh tính khách.' });
    return reader.forCustomer(customerId);
  });

  app.post<{ Body: { ebookIds: string[] } }>('/orders', { schema: placeOrderSchema }, async (request, reply) => {
    const customerId = customerOf(request.headers['x-customer-id']);
    if (customerId === undefined) return reply.status(401).send({ message: 'Thiếu danh tính khách.' });
    const orderId = await placeOrder.handle({ customerId, ebookIds: request.body.ebookIds });
    return reply.status(201).send({ orderId });
  });

  return app;
}
