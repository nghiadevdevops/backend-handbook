import { describe, expect, it } from 'vitest';
import { ConfigError, composeFromEnv } from '../../src/composition.ts';
import { InMemoryOrderRepository } from '../../src/infrastructure/in-memory-order-repository.ts';
import { PostgresOrderRepository } from '../../src/infrastructure/postgres-order-repository.ts';

/** Cheap tests for the "glue": which adapter is bound to the port, which env var is mandatory. */
describe('composition root', () => {
  it('binds OrderRepository to the Postgres adapter when DATABASE_URL is set', () => {
    const deps = composeFromEnv({ API_TOKEN: 't', DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

    expect(deps.orders).toBeInstanceOf(PostgresOrderRepository);
  });

  it('falls back to the in-memory adapter without DATABASE_URL (dev only)', () => {
    expect(composeFromEnv({ API_TOKEN: 't' }).orders).toBeInstanceOf(InMemoryOrderRepository);
  });

  it('fails fast when API_TOKEN is missing', () => {
    expect(() => composeFromEnv({})).toThrow(ConfigError);
    expect(() => composeFromEnv({ API_TOKEN: '' })).toThrow('Thieu API_TOKEN');
  });
});
