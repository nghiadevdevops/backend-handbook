/** Read model: hình dạng do màn hình cần, không phải aggregate. */
export interface OrderSummary {
  readonly orderId: string;
  readonly status: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly titles: readonly string[];
  readonly placedAt: string;
}
