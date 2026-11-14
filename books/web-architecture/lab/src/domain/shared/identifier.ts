import { InvalidArgumentError } from './errors.js';

declare const brand: unique symbol;

/**
 * Branded type: một `string` mang thêm "nhãn" chỉ tồn tại lúc compile.
 * Lúc chạy nó vẫn là string trần (không tốn bộ nhớ, JSON.stringify ra đúng chuỗi).
 */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/**
 * Cổng duy nhất để tạo một ID: kiểm tra giá trị rồi "gắn nhãn".
 * Kiểm tra `typeof` vì kiểu của TypeScript biến mất lúc chạy (dữ liệu JSON có thể là số).
 */
export function parseIdentifier<Name extends string>(kind: Name, value: unknown): Brand<string, Name> {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidArgumentError(`${kind} không được rỗng.`);
  }
  return value as Brand<string, Name>;
}
