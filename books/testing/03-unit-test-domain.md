# Chương 3. Unit test cho domain: output, state, communication

## 1. Tình huống

`Order.total()` có quy tắc giảm 10% từ 1.000.000 đ. Một dev sửa `>=` thành `>` "cho hợp lý", và đơn đúng 1.000.000 đ bị tính sai suốt hai tuần. Không test nào kiểm tra đúng biên. Domain là nơi chứa logic quý nhất, rẻ nhất để test (không I/O), nên đáng đầu tư nhất.

## 2. Ba kiểu kiểm tra

Khorikov chia theo thứ ta kiểm tra:

| Kiểu | Kiểm tra gì | Hợp với | Brittleness |
|---|---|---|---|
| **Output** | giá trị trả về của pure function | `total()`, `discountPercent()` | thấp nhất |
| **State** | state của object sau khi gọi command | `place()`, `markPaid()` | thấp, nếu đọc qua public API |
| **Communication** | các lời gọi tới collaborator (mock) | gọi hệ thống ngoài | cao nhất |

Domain tốt nên nghiêng về output và state. Communication để dành cho system boundary (chương 4).

## 3. Output: pure function

Lấy từ `lab/tests/unit/order.test.ts`. Kiểm tra ngay hai bên của biên:

```ts
it('no discount just below vip threshold', () => {
  const order = OrderBuilder.anOrder().withoutLines().build();
  order.addLine('A', 1, Money.vnd(999_999));

  expect(order.total().amount).toBe(999_999);
});

it('discount applies exactly at vip threshold', () => {
  const order = OrderBuilder.anOrder().withoutLines().build();
  order.addLine('A', 1, Money.vnd(1_000_000));

  expect(order.total().amount).toBe(900_000);
});
```

Ví dụ số cụ thể (999.999 và 1.000.000) thay vì tính lại công thức. Test này sẽ kill mutant `>=` thành `>` (chương 11).

Với value object, dùng `it.each` để liệt kê nhiều ca (từ `lab/tests/unit/money.test.ts`):

```ts
it.each([
  ['giam 10% cua 1.000.000', 1_000_000, 10, 900_000],
  ['lam tron xuong', 999, 10, 899],
  ['giam 0%', 500, 0, 500],
  ['giam 100%', 500, 100, 0],
])('applies percent discount rounding down: %s', (_name, amount, percent, expected) => {
  expect(Money.vnd(amount).discountPercent(percent).amount).toBe(expected);
});
```

Tên ca (`%s` lấy từ phần tử đầu của mỗi hàng) hiện trong báo cáo, nên khi một ca đỏ bạn biết ngay ca nào. `node:test` cũng làm được việc tương tự bằng vòng lặp quanh `it(...)`; lab chọn Vitest vì cần thêm snapshot, mock và runner của StrykerJS (chương 11).

## 4. State: command thay đổi state

```ts
it('placing a draft order records status and time', () => {
  const order = OrderBuilder.anOrder().build();
  const now = new Date('2026-11-07T09:30:00+00:00');

  order.place(now);

  expect(order.status).toBe('placed');
  expect(order.placedAt).toEqual(now);
});
```

Chú ý: ta đọc state qua getter `status` và `placedAt`, là public API. Các field thật của `Order` là private field `#status`, `#placedAt` của JavaScript nên test không thể (và không cần) chọc vào chúng. Thời gian được **truyền vào** (`place(now)`) thay vì gọi `new Date()` bên trong, nên test deterministic (xác định) và không cần fake timer ở domain. Lưu ý `Date` của JavaScript là mutable: `Order` lưu bản copy (`new Date(now)`) và getter trả bản copy, nên đây là lý do dùng `toEqual` (so giá trị) thay vì `toBe` (so reference).

Quy tắc bị vi phạm cũng là hành vi cần test:

```ts
it('paid order cannot be cancelled', () => {
  const order = OrderBuilder.anOrder().paid().build();

  expect(() => order.cancel()).toThrow(DomainError);
  expect(() => order.cancel()).toThrow('khong the huy');
});
```

## 5. Aggregate: test qua root

`Order` là aggregate root; `OrderLine` chỉ được tạo/đổi qua `Order.addLine`. Vì vậy chỉ cần test qua `Order`, không test `OrderLine` riêng lẻ trừ khi nó có logic độc lập. Ví dụ invariant (bất biến) "tối đa 5 dòng":

```ts
it('allows at most five lines', () => {
  const order = new Order('o-9', 'c-1');
  for (let i = 1; i <= MAX_LINES; i++) {
    order.addLine(`SKU-${i}`, 1, Money.vnd(1_000));
  }

  expect(() => order.addLine('SKU-6', 1, Money.vnd(1_000))).toThrow(new DomainError('Don toi da 5 dong'));
});
```

Test invariant của aggregate là loại test giá trị nhất ở domain: nếu ai đó phá bất biến, test đỏ ngay. Với `toThrow(new DomainError('...'))`, Vitest so khớp theo `message`; nếu cần chắc cả class, thêm một assertion `toThrow(DomainError)` như ví dụ ở mục 4.

## 6. Tên test và cấu trúc

- Đặt tên theo **hành vi**, không theo tên method: `cannot place an order twice`, không phải `test place 2`.
- Cấu trúc Arrange-Act-Assert (hoặc Given-When-Then), mỗi test một hành vi. Một test có thể có nhiều assertion nếu chúng cùng mô tả một hành vi.
- Dùng builder để chỉ nêu dữ liệu liên quan (chương 12).

## 7. Trade-off

- Unit test domain nhanh, không brittle, nên *nên* viết rộng rãi.
- KHÔNG cần test getter/setter tầm thường hoặc code không có logic. Chúng sẽ được chạy gián tiếp qua test hành vi.
- Không nên mở public API chỉ để test. Nếu muốn test cái gì đó private, thường nó là một khái niệm domain chưa được đặt tên: tách thành value object.

## 8. Cạm bẫy

- Dùng `as any`, `@ts-ignore` hay `(obj as unknown as {...})` để đọc/ghi field private: test dính chặt implementation, và TypeScript strict đang cố ngăn bạn làm điều đó.
- Dùng `new Date()`/`Math.random()` bên trong domain làm test non-deterministic. Truyền vào qua parameter hoặc port `Clock`.
- Một test gọi nhiều hành vi, khó biết dòng nào làm đỏ.
- Chỉ test happy path, bỏ biên và ca vi phạm quy tắc.
- `Money` lưu số nguyên trong `number`: an toàn đến `Number.MAX_SAFE_INTEGER` (khoảng 9 triệu tỷ). Lab kiểm tra bằng `Number.isSafeInteger` ở constructor; với tiền có phần thập phân hoặc số rất lớn hãy dùng `bigint`.

## 9. Tóm tắt

- Ưu tiên kiểm tra output và state; communication chỉ ở biên.
- Test hai phía của mọi biên (999.999 và 1.000.000).
- Test aggregate qua root; test invariant là loại test giá trị nhất.
- Đưa thời gian và ngẫu nhiên vào từ ngoài để test deterministic.

## 10. Câu hỏi tự kiểm tra

1. Vì sao `place(now: Date)` dễ test hơn việc gọi `new Date()` trong thân hàm?
2. Khi nào kiểm tra communication ở domain là dấu hiệu xấu?
3. Tại sao test cả `999_999` và `1_000_000`?
4. Muốn test một hàm private phức tạp, nên làm gì?

<details><summary>Đáp án</summary>

1. Thời gian trở thành parameter nên test điều khiển được và kết quả deterministic; không cần fake timer.
2. Khi domain mock lẫn nhau (entity gọi entity): test gắn với cấu trúc nội bộ và brittle khi refactor; domain nên kiểm tra output/state.
3. Để bắt lỗi ở biên (`>=` thành `>`), loại lỗi off-by-one phổ biến.
4. Thường đó là một khái niệm chưa được tách ra: tách thành class/value object riêng với public API rồi test nó.
</details>
