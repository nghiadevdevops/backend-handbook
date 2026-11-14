import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SendOrderConfirmationWhenOrderPlaced } from '../application/listener/send-order-confirmation-when-order-placed.js';
import { OrderPlaced } from '../domain/order/order-events.js';
import { SEND_ORDER_CONFIRMATION } from './tokens.js';

/**
 * Cầu nối mỏng: Nest tìm @OnEvent để đăng ký, còn việc thật do listener của core làm.
 * Nhờ vậy core không phải import decorator nào của Nest.
 */
@Injectable()
export class OrderConfirmationSubscriber {
  constructor(@Inject(SEND_ORDER_CONFIRMATION) private readonly listener: SendOrderConfirmationWhenOrderPlaced) {}

  // suppressErrors: false để lỗi của listener truyền ngược về emitAsync (mặc định Nest chỉ log và nuốt lỗi).
  @OnEvent(OrderPlaced.name, { suppressErrors: false })
  async onOrderPlaced(event: OrderPlaced): Promise<void> {
    await this.listener.handle(event);
  }
}
