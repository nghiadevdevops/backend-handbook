import { type Brand, parseIdentifier } from '../shared/identifier.js';

export type OrderId = Brand<string, 'OrderId'>;

export const OrderId = {
  of: (value: string): OrderId => parseIdentifier('OrderId', value),

  /** UUID v4. Chỉ OrderRepository.nextIdentity() được gọi hàm này. */
  generate: (): OrderId => parseIdentifier('OrderId', crypto.randomUUID()),
};
