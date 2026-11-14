import { Injectable, Logger } from '@nestjs/common';
import type { OrderNotifier } from '../application/port/out/order-notifier.js';
import type { CustomerId } from '../domain/order/customer-id.js';
import type { OrderId } from '../domain/order/order-id.js';
import type { Money } from '../domain/shared/money.js';

/**
 * Adapter của OrderNotifier: ghi log thay vì gửi mail để lab không cần SMTP.
 * Adapter thật (nodemailer, SES, SMS...) chỉ cần implement cùng interface.
 */
@Injectable()
export class LogOrderNotifier implements OrderNotifier {
  readonly #logger = new Logger(LogOrderNotifier.name);

  async sendOrderConfirmation(customerId: CustomerId, orderId: OrderId, total: Money): Promise<void> {
    this.#logger.log(`Gửi xác nhận cho ${customerId}: đơn ${orderId}, tổng ${total.format()}`);
  }
}
