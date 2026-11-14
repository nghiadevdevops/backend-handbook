import type { PayOrderCommand } from '../../pay-order/pay-order-command.js';

/** Primary port. */
export interface PayOrderUseCase {
  handle(command: PayOrderCommand): Promise<void>;
}
