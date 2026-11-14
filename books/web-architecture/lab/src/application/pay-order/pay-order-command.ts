export interface PayOrderCommand {
  readonly orderId: string;
  readonly paymentReference: string;
}
