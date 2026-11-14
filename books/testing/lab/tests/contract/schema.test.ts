import { describe, expect, it } from 'vitest';
import { presentOrder } from '../../src/application/order-presenter.ts';
import { OrderBuilder } from '../support/order-builder.ts';

/**
 * Schema test on the PROVIDER side: the response must satisfy the "contract" a consumer relies on.
 * The consumer only needs these fields: adding a field is safe, renaming or retyping breaks it.
 */
const CONTRACT = {
  id: 'string',
  status: 'string',
  total: 'number',
  currency: 'string',
  lines: 'array',
} as const;

const LINE_CONTRACT = {
  sku: 'string',
  quantity: 'number',
  unitPrice: 'number',
} as const;

type JsonType = 'string' | 'number' | 'array';

function typeOf(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'number' : 'non-integer number';
  }

  return typeof value;
}

function assertShape(contract: Record<string, JsonType>, actual: Record<string, unknown>): void {
  for (const [field, type] of Object.entries(contract)) {
    expect(actual, `Thieu truong '${field}'`).toHaveProperty(field);
    expect(typeOf(actual[field]), `Sai kieu o '${field}'`).toBe(type);
  }
}

describe('order response contract', () => {
  it('satisfies consumer contract', () => {
    const payload = presentOrder(OrderBuilder.anOrder().placed().build());

    assertShape(CONTRACT, payload as unknown as Record<string, unknown>);
    expect(payload.lines.length).toBeGreaterThan(0);
    for (const line of payload.lines) {
      assertShape(LINE_CONTRACT, line as unknown as Record<string, unknown>);
    }
  });

  it('detects a field that changed type (total as string)', () => {
    const payload = { ...presentOrder(OrderBuilder.anOrder().placed().build()), total: '1080000.00' };

    expect(() => assertShape(CONTRACT, payload as unknown as Record<string, unknown>)).toThrow(
      "Sai kieu o 'total'",
    );
  });
});
