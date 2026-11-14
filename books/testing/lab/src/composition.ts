import pg from 'pg';
import type { OrderRepository } from './application/ports.ts';
import type { AppDeps } from './http/app.ts';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway.ts';
import { InMemoryOrderRepository } from './infrastructure/in-memory-order-repository.ts';
import { PostgresOrderRepository } from './infrastructure/postgres-order-repository.ts';

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Composition root: reads the environment and decides which adapter backs each port.
 * Wiring mistakes (missing env var, wrong adapter) are tested here, not through HTTP.
 */
export function composeFromEnv(env: Record<string, string | undefined>): AppDeps & { orders: OrderRepository } {
  const apiToken = env['API_TOKEN'];
  if (apiToken === undefined || apiToken === '') {
    throw new ConfigError('Thieu API_TOKEN');
  }

  const databaseUrl = env['DATABASE_URL'];
  const orders =
    databaseUrl === undefined
      ? new InMemoryOrderRepository()
      : new PostgresOrderRepository(new pg.Pool({ connectionString: databaseUrl }));

  return {
    orders,
    payments: new FakePaymentGateway(true), // the lab has no real payment provider
    clock: { now: () => new Date() },
    apiToken,
  };
}
