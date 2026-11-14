import type { Pool } from 'pg';
import { Ebook } from '../../domain/catalog/ebook.js';
import type { EbookCatalog } from '../../domain/catalog/ebook-catalog.js';
import type { EbookId } from '../../domain/catalog/ebook-id.js';
import { EbookNotFound } from '../../domain/catalog/ebook-not-found.js';
import { Money } from '../../domain/shared/money.js';

interface EbookRow {
  title: string;
  price_amount: string;
  price_currency: string;
}

export class PgEbookCatalog implements EbookCatalog {
  constructor(private readonly pool: Pool) {}

  async get(id: EbookId): Promise<Ebook> {
    const result = await this.pool.query<EbookRow>(
      'SELECT title, price_amount, price_currency FROM ebooks WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw EbookNotFound.withId(id);
    }
    return new Ebook(id, row.title, Money.of(Number(row.price_amount), row.price_currency));
  }
}
