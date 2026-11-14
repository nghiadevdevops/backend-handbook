# Chapter 1. Why we test and what makes a good test

## 1. Scenario

Nhóm bạn có 2.000 test, coverage 90%, CI xanh. Thứ Sáu, một refactor "chỉ đổi cấu trúc" làm 340 test đỏ, dù hành vi không đổi. Tuần sau, một bug thật (giảm giá sai ở ngưỡng 1.000.000 đ) lọt lên production, vì không test nào kiểm tra đúng biên đó. Đây là hai cách một bộ test thất bại: **false positive** (báo động giả: đỏ khi không có lỗi) và **false negative** (bỏ sót: xanh khi có lỗi).

Coverage 90% không nói gì về chất lượng. Nó chỉ cho biết dòng nào *được chạy*, không cho biết có dòng nào được *kiểm tra*. Chương 11 sẽ đo điều đó bằng mutation testing.

## 2. What tests are for

Test tự động có hai mục đích thực dụng:

1. **Cho phép thay đổi code mà không sợ.** Giá trị lớn nhất không phải là "bắt bug hôm nay", mà là bạn dám refactor, nâng phiên bản framework, đổi database vào năm sau.
2. **Là living documentation về hành vi.** Test đặt tên tốt đọc như đặc tả: `discount_applies_exactly_at_vip_threshold`.

Test không dùng để "chứng minh code đúng" (không thể) mà để giảm xác suất regression (hành vi cũ bị hỏng bởi thay đổi mới).

## 3. The four properties of a good test (after Khorikov)

Vladimir Khorikov, trong *Unit Testing: Principles, Practices, and Patterns*, mô tả bốn trụ cột. Giá trị của một test là **tích** của chúng, nên một trụ bằng 0 thì cả test vô giá trị.

| Thuộc tính | Ý nghĩa | Làm sao tăng |
|---|---|---|
| Bảo vệ khỏi regression | Bắt được bug khi hành vi hỏng | Chạy nhiều code có logic; kiểm tra đúng kết quả quan trọng |
| Resistance to refactoring (chịu được refactor) | Không đỏ khi chỉ đổi implementation | Kiểm tra **observable behavior**, không kiểm tra implementation detail |
| Fast feedback | Chạy trong mili giây | Tránh I/O, mạng, DB ở test nhỏ |
| Maintainability | Dễ đọc, dễ chạy | Test ngắn, ít setup, ít dependency |

Khorikov nhấn mạnh trụ thứ hai gần như là nhị phân: test hoặc chịu được refactor, hoặc không. False positive làm đội mất niềm tin vào bộ test, và họ ngừng đọc kết quả đỏ.

Có sự trade-off giữa ba trụ đầu: E2E bảo vệ regression rất tốt nhưng chậm. Test kiểm tra từng lời gọi `private` thì nhanh nhưng brittle. Mục tiêu là chọn đúng cân bằng cho từng layer (các chương sau).

## 4. Observable behavior vs implementation detail

Quy tắc dễ nhớ: test chỉ nên biết về **public API và kết quả mà người dùng/hệ thống khác thấy**.

```ts
// DỄ VỠ: kiểm tra cách làm (minh họa, không có trong lab)
const orders = { get: vi.fn().mockResolvedValue(order), save: vi.fn() };
await new PayOrder(orders, gateway).execute('o-1');
expect(orders.get).toHaveBeenCalledOnce();
expect(orders.save).toHaveBeenCalledWith(order);

// BỀN: kiểm tra kết quả (orders là InMemoryOrderRepository đã lưu đơn placed 'o-1')
await new PayOrder(orders, gateway).execute('o-1');
expect((await orders.get('o-1')).status).toBe('paid');
```

Test thứ nhất vỡ nếu bạn đổi `get` thành `findById`, hoặc thêm cache, dù hành vi như cũ. Test thứ hai thì không. Mã nguồn của test thứ hai nằm trong `lab/tests/application/pay-order.test.ts`.

## 5. The running sample project

Cả sách dùng một hệ thống đặt hàng nhỏ ở `lab/`:

```
src/  domain/          Order, OrderLine, Money, OrderStatus, DomainError  application/     PlaceOrder, PayOrder, CancelOrder           (use case)                   ports.ts: OrderRepository, PaymentGateway, Clock (port)                   order-presenter.ts                           (JSON output)  infrastructure/  PostgresOrderRepository                      (adapter thật)                   InMemoryOrderRepository, FakePaymentGateway, FixedClock (fake)  http/            app.ts (Fastify)                             (driving adapter, chương 7)  legacy/          shipping-fee.ts                              (mô phỏng legacy code)
```

Business rule (có mã AC ở chương 8): đơn tối đa 5 dòng; đơn rỗng không đặt được; tổng từ 1.000.000 đ được giảm 10%; chỉ đơn đã đặt mới thanh toán được; đơn đã thanh toán không hủy được.

## 6. Common pitfalls

- **Đuổi theo coverage.** Coverage là chỉ báo âm (thấp thì chắc chắn thiếu test), không phải chỉ báo dương.
- **Test chỉ để "cho xanh".** Test không có assertion thực chất (hoặc assert điều hiển nhiên) vẫn cộng coverage. Vitest có tùy chọn `expect.requireAssertions: true` (đã bật trong `lab/vitest.config.ts`) để test không có assertion bị đỏ. Khi bật, chính property test của lab đã đỏ lần đầu vì `fc.assert` không gọi `expect` (chương 11).
- **Test lặp lại logic của code.** Nếu test tính `0.9 * total` y như code, nó chỉ chứng minh code bằng chính nó. Hãy dùng ví dụ cụ thể (`1_200_000` cho `1_080_000`).
- **Test phụ thuộc thứ tự chạy** hoặc dữ liệu từ test khác.

## 7. Summary

- Test tồn tại để cho phép thay đổi an toàn, không phải để đạt một con số coverage.
- Bốn trụ: bảo vệ regression, chịu refactor, nhanh, dễ bảo trì; giá trị là tích nên không trụ nào được bằng 0.
- Chịu được refactor nghĩa là test chỉ nhìn vào observable behavior.
- False positive nguy hiểm hơn thiếu test vì nó dạy cả đội phớt lờ test đỏ.

## 8. Self-check questions

1. Vì sao coverage 100% vẫn có thể cho một bộ test vô dụng?
2. Hai test cùng kiểm tra `PayOrder`: một cái `expect(orders.get).toHaveBeenCalledOnce()`, một cái assert state của đơn sau khi chạy. Cái nào chịu refactor tốt hơn và vì sao?
3. Khorikov coi "chịu được refactor" khác ba trụ còn lại ở điểm nào?
4. Test "tính lại công thức giống code" có hại gì?

<details><summary>Answer</summary>

1. Coverage chỉ đo dòng được thực thi, không đo việc kết quả có được kiểm tra hay không. Một test gọi hàm mà không assert vẫn tạo 100% coverage.
2. Test assert state. Test kia gắn chặt với việc dùng đúng method `get`; đổi tên hoặc thêm cache là vỡ dù hành vi giữ nguyên.
3. Nó gần như nhị phân (test hoặc chịu được hoặc không) và phụ thuộc vào cách viết test, trong khi ba trụ kia là phổ liên tục và trade-off lẫn nhau.
4. Nếu công thức trong code sai thì test cũng sai y hệt nên vẫn xanh; nó không bắt được lỗi hiểu sai yêu cầu. Nên dùng ví dụ số cụ thể lấy từ đặc tả.
</details>
