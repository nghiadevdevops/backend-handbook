import type { EbookId } from '../catalog/ebook-id.js';
import type { Money } from '../shared/money.js';

/**
 * Value Object nằm trong aggregate Order. Chụp lại tên và giá lúc đặt (snapshot);
 * tham chiếu sang Ebook chỉ bằng EbookId.
 */
export class OrderLine {
  constructor(
    readonly ebookId: EbookId,
    readonly title: string,
    readonly price: Money,
  ) {
    Object.freeze(this);
  }

  equals(other: OrderLine): boolean {
    return this.ebookId === other.ebookId && this.title === other.title && this.price.equals(other.price);
  }
}
