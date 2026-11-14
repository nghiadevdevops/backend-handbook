import type { OrderSummary } from './order-summary.js';

/** Port phía đọc (query side). Không trả về Order. */
export interface OrderSummaryReader {
  /** Mới nhất trước. */
  forCustomer(customerId: string): Promise<readonly OrderSummary[]>;
}
