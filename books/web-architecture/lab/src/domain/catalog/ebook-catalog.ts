import type { Ebook } from './ebook.js';
import type { EbookId } from './ebook-id.js';

export interface EbookCatalog {
  /** @throws EbookNotFound */
  get(id: EbookId): Promise<Ebook>;
}
