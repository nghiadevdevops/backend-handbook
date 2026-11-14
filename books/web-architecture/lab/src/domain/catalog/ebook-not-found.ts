import { DomainRuleViolation } from '../shared/errors.js';
import type { EbookId } from './ebook-id.js';

export class EbookNotFound extends DomainRuleViolation {
  static withId(id: EbookId): EbookNotFound {
    return new EbookNotFound(`Không tìm thấy e-book ${id}.`);
  }
}
