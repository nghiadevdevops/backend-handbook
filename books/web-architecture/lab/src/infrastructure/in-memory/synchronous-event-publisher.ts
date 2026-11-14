import type { EventPublisher } from '../../application/port/out/event-publisher.js';
import type { DomainEvent } from '../../domain/shared/domain-event.js';

type EventClass<E extends DomainEvent> = abstract new (...args: never[]) => E;
type Listener<E extends DomainEvent> = (event: E) => void | Promise<void>;

export class SynchronousEventPublisher implements EventPublisher {
  readonly #listeners = new Map<EventClass<DomainEvent>, Listener<DomainEvent>[]>();

  subscribe<E extends DomainEvent>(eventClass: EventClass<E>, listener: Listener<E>): void {
    const list = this.#listeners.get(eventClass) ?? [];
    list.push(listener as Listener<DomainEvent>);
    this.#listeners.set(eventClass, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const listener of this.#listeners.get(event.constructor as EventClass<DomainEvent>) ?? []) {
      await listener(event);
    }
  }
}
