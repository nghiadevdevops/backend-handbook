import { type Brand, parseIdentifier } from '../shared/identifier.js';

export type EbookId = Brand<string, 'EbookId'>;

export const EbookId = {
  of: (value: string): EbookId => parseIdentifier('EbookId', value),
};
