import type { Money } from '../shared/money.js';
import type { EbookId } from './ebook-id.js';

/**
 * Entity: có identity (EbookId) và vòng đời. Giá có thể đổi nhưng vẫn là cùng một e-book.
 */
export class Ebook {
  readonly #id: EbookId;
  #title: string;
  #price: Money;

  constructor(id: EbookId, title: string, price: Money) {
    this.#id = id;
    this.#title = title;
    this.#price = price;
  }

  get id(): EbookId {
    return this.#id;
  }

  get title(): string {
    return this.#title;
  }

  get price(): Money {
    return this.#price;
  }

  reprice(newPrice: Money): void {
    this.#price = newPrice;
  }

  equals(other: Ebook): boolean {
    return this.#id === other.#id;
  }
}
