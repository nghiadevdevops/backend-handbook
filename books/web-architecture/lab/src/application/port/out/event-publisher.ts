import type { DomainEvent } from '../../../domain/shared/domain-event.js';

/** Secondary port: phát domain event ra ngoài core. */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
