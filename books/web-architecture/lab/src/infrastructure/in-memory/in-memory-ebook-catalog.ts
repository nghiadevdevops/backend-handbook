import type { Ebook } from '../../domain/catalog/ebook.js';
import type { EbookCatalog } from '../../domain/catalog/ebook-catalog.js';
import type { EbookId } from '../../domain/catalog/ebook-id.js';
import { EbookNotFound } from '../../domain/catalog/ebook-not-found.js';

export class InMemoryEbookCatalog implements EbookCatalog {
  readonly #ebooks = new Map<string, Ebook>();

  add(ebook: Ebook): void {
    this.#ebooks.set(ebook.id, ebook);
  }

  async get(id: EbookId): Promise<Ebook> {
    const ebook = this.#ebooks.get(id);
    if (ebook === undefined) {
      throw EbookNotFound.withId(id);
    }
    return ebook;
  }
}
