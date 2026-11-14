import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventPublisher } from '../application/port/out/event-publisher.js';
import type { DomainEvent } from '../domain/shared/domain-event.js';

/**
 * Adapter của port EventPublisher dựa trên EventEmitter2 của @nestjs/event-emitter.
 * Tên event = tên class (OrderPlaced). emitAsync đợi mọi listener xong rồi mới trả về.
 */
@Injectable()
export class NestEventPublisher implements EventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.constructor.name, event);
  }
}
