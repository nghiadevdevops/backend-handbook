import type { OrderId } from '../../../domain/order/order-id.js';
import type { PlaceOrderCommand } from '../../place-order/place-order-command.js';

/** Primary port: một phần API của ứng dụng. Adapter bên ngoài GỌI vào đây. */
export interface PlaceOrderUseCase {
  handle(command: PlaceOrderCommand): Promise<OrderId>;
}
