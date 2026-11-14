import { type Brand, parseIdentifier } from '../shared/identifier.js';

export type CustomerId = Brand<string, 'CustomerId'>;

export const CustomerId = {
  of: (value: string): CustomerId => parseIdentifier('CustomerId', value),
};
