// Các test này chủ yếu được kiểm tra lúc COMPILE (tsc --noEmit). Dòng `@ts-expect-error`
// là một khẳng định: nếu dòng bên dưới KHÔNG còn lỗi kiểu, tsc báo lỗi.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { CustomerId } from '../src/domain/order/customer-id.js';
import { OrderId } from '../src/domain/order/order-id.js';

// Structural typing: hai alias của cùng kiểu nền thì dùng thay nhau thoải mái.
type PlainOrderId = string;
type PlainCustomerId = string;
const takesPlainCustomer = (id: PlainCustomerId): string => id;

// Hai class khác tên nhưng cùng hình dạng: TypeScript coi là tương thích.
class Meters {
  constructor(readonly value: number) {}
}
class Seconds {
  constructor(readonly value: number) {}
}
const takesMeters = (m: Meters): number => m.value;

// Class có thành viên #private thì trở thành "nominal": chỉ chính class đó khớp.
class SecretMeters {
  readonly #tag = 'meters';
  constructor(readonly value: number) {}
  tag(): string {
    return this.#tag;
  }
}
class SecretSeconds {
  readonly #tag = 'seconds';
  constructor(readonly value: number) {}
  tag(): string {
    return this.#tag;
  }
}
const takesSecretMeters = (m: SecretMeters): number => m.value;

function placeFor(customerId: CustomerId, orderId: OrderId): string {
  return `${customerId}/${orderId}`;
}

test('alias string trần bị lẫn lộn mà tsc không báo gì', () => {
  const orderId: PlainOrderId = 'o-1';
  assert.equal(takesPlainCustomer(orderId), 'o-1'); // truyền "OrderId" vào chỗ "CustomerId": vẫn biên dịch
});

test('class cùng hình dạng thì tương thích (structural)', () => {
  assert.equal(takesMeters(new Seconds(5)), 5);
});

test('class có #private là nominal', () => {
  // @ts-expect-error SecretSeconds không gán được cho SecretMeters dù cùng hình dạng công khai
  assert.equal(takesSecretMeters(new SecretSeconds(5)), 5);
});

test('branded ID chặn truyền nhầm lúc compile', () => {
  const customerId = CustomerId.of('c-1');
  const orderId = OrderId.of('o-1');
  assert.equal(placeFor(customerId, orderId), 'c-1/o-1');

  // @ts-expect-error đảo thứ tự: OrderId không gán được cho CustomerId
  placeFor(orderId, customerId);
  // @ts-expect-error string trần chưa qua OrderId.of nên không có nhãn
  placeFor(customerId, 'o-1');
  // @ts-expect-error EbookId cũng không thay được OrderId
  placeFor(customerId, EbookId.of('e-1'));
});

test('brand biến mất lúc chạy: đây là giới hạn cần biết', () => {
  // Lúc chạy cả hai chỉ là chuỗi 'a'. Brand KHÔNG bảo vệ khi dữ liệu đi qua `as`, any hoặc JSON.
  const asOrder: string = OrderId.of('a');
  const asCustomer: string = CustomerId.of('a');
  assert.equal(asOrder, asCustomer);
});
