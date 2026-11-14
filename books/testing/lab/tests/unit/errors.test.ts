import { describe, expect, it } from 'vitest';
import { OrderNotFound } from '../../src/application/order-not-found.ts';
import { DomainError } from '../../src/domain/domain-error.ts';

// `name` shows up in logs and in the HTTP error mapping, so it is observable behaviour.
describe('error types', () => {
  it('DomainError identifies itself', () => {
    const error = new DomainError('x');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DomainError');
  });

  it('OrderNotFound identifies itself and names the id', () => {
    const error = OrderNotFound.withId('o-9');

    expect(error.name).toBe('OrderNotFound');
    expect(error.message).toBe('Khong tim thay don o-9');
  });
});
