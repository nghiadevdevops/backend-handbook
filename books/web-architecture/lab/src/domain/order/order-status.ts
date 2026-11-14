import { InvalidArgumentError } from '../shared/errors.js';

/** Const object + union: không dùng enum (enum sinh code lúc chạy, không "erasable"). */
export const OrderStatus = {
  Pending: 'pending',
  Paid: 'paid',
  Cancelled: 'cancelled',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Dùng khi đọc từ nơi lưu trữ: dữ liệu ngoài là string, phải kiểm tra trước khi tin. */
export function parseOrderStatus(value: string): OrderStatus {
  const known: string[] = Object.values(OrderStatus);
  if (!known.includes(value)) {
    throw new InvalidArgumentError(`Trạng thái đơn không hợp lệ: ${value}.`);
  }
  return value as OrderStatus;
}
