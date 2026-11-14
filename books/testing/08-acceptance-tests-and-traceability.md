# Chương 8. Acceptance test và traceability từ acceptance criteria tới test

## 1. Tình huống

Product owner hỏi: "Acceptance criteria AC-ORD-5 (thanh toán bị từ chối thì đơn giữ nguyên) đã có test chưa?" Bạn lục 300 test và không chắc. Trong Spec-Driven Development, acceptance criteria (AC) là hợp đồng với nghiệp vụ; nếu không có traceability từ AC → test, bạn không biết yêu cầu nào đang được bảo vệ, yêu cầu nào đang bị hở.

## 2. Acceptance test là gì

Acceptance test kiểm tra **một hành vi mà người dùng/nghiệp vụ quan tâm**, diễn đạt theo ngôn ngữ nghiệp vụ, độc lập với implementation. Nó không bắt buộc đi qua UI hay HTTP. Với Hexagonal, entry point tự nhiên là **use case (driving port)**, với fake ở các port ra ngoài:

```
 Given -> set up state qua use case/builder
 When  -> gọi use case (driving port)
 Then  -> kiểm tra observable result (state, giao tiếp ra boundary)
```

Mức này vừa đủ nhanh (ms) để chạy mỗi commit, vừa đủ cao để mô tả yêu cầu. Khi cần bảo đảm hệ thống nối đúng từ HTTP xuống DB, thêm vài test mỏng ở chương 7 và 12.

## 3. Bảng AC của dự án mẫu

`lab/docs/acceptance-criteria.md`:

| ID | Given | When | Then |
|---|---|---|---|
| AC-ORD-1 | khách có giỏ hàng 1 dòng | khách đặt đơn | đơn `placed`, ghi nhận thời điểm đặt |
| AC-ORD-2 | giỏ hàng rỗng | khách đặt đơn | hệ thống từ chối, không lưu đơn |
| AC-ORD-3 | giỏ hàng trị giá 1.200.000 VND | khách đặt đơn | tổng tiền 1.080.000 VND |
| AC-ORD-4 | đơn đã đặt, trị giá 300.000 | thanh toán, cổng chấp nhận | đơn `paid`, cổng bị thu đúng 1 lần với 300.000 |
| AC-ORD-5 | đơn đã đặt | cổng thanh toán từ chối | đơn vẫn `placed` |
| AC-ORD-6 | đơn đã thanh toán | khách hủy đơn | bị từ chối |

## 4. Từ AC sang test: một AC, một test, có mã

Quy ước của lab: tên test bắt đầu bằng mã AC (`AC-ORD-n: ...`). Hai lợi ích: đọc tên là biết yêu cầu nào, và chạy riêng được bằng `vitest run -t AC-ORD-5` (`-t` lọc theo tên test; kết quả thật: `Tests  1 passed | 5 skipped (6)`). Vitest có cơ chế tag riêng cho test ở các bản mới; lab chọn tiền tố trong tên vì `grep` đọc được cả tên lẫn tài liệu AC và chạy được ở mọi phiên bản.

```ts
it('AC-ORD-5: declined payment leaves order placed', async () => {
  // Given a placed order
  await placeOrder().execute('o-5', 'c-1', [{ sku: 'A', quantity: 1, unitPrice: 100_000 }]);

  // When the gateway declines
  await expect(new PayOrder(orders, new FakePaymentGateway(false)).execute('o-5')).rejects.toThrow(
    DomainError,
  );

  // Then the order is still "placed"
  expect((await orders.get('o-5')).status).toBe('placed');
});
```

Ba comment `Given/When/Then` bám sát cột trong bảng AC, nên người không rành TypeScript vẫn đối chiếu được. Toàn bộ file: `lab/tests/acceptance/order.acceptance.test.ts` (6 test, mỗi AC một test).

Chạy thật:

```
$ ./run.sh accept
 ✓ tests/acceptance/order.acceptance.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Ví dụ AC-ORD-3 chỉ ra giá trị của số cụ thể:

```ts
// Given a cart worth 1,200,000 VND
const lines = [{ sku: 'TV', quantity: 1, unitPrice: 1_200_000 }];
// When the customer places the order
await placeOrder().execute('o-3', 'c-1', lines);
// Then the total is 1,080,000 VND
expect((await orders.get('o-3')).total().amount).toBe(1_080_000);
```

## 5. Traceability

Có hai chiều cần đảm bảo:

- **Forward**: mỗi AC có ít nhất một test.
- **Backward**: mỗi test acceptance trỏ về một AC (không có test "orphan").

Script `run.sh trace` (file `lab/scripts/trace.sh`, chạy trong container bằng `grep`) kiểm tra **cả hai chiều** bằng text tools: lấy các mã `AC-ORD-n` trong tài liệu AC rồi đếm file test có chuỗi `'AC-ORD-n:`; chiều ngược lại lấy các mã trong test và kiểm tra chúng có trong tài liệu:

```
$ ./run.sh trace
Forward (AC -> test):
AC-ORD-1 -> 1 test file(s)
AC-ORD-2 -> 1 test file(s)
AC-ORD-3 -> 1 test file(s)
AC-ORD-4 -> 1 test file(s)
AC-ORD-5 -> 1 test file(s)
AC-ORD-6 -> 1 test file(s)
Backward (test -> AC):
AC-ORD-1 -> in docs
...
AC-ORD-6 -> in docs
```

Script thoát với mã 1 nếu có AC không có test hoặc có test mồ côi. Đã thử thêm một dòng `AC-ORD-7` giả vào tài liệu: script in `AC-ORD-7 -> 0 test file(s)` và `exit=1`; có thể đưa vào CI để fail build. Đây là cơ chế đơn giản; công cụ BDD đầy đủ (Cucumber.js với Gherkin `.feature`) cung cấp traceability sẵn nhưng thêm một lớp ngôn ngữ phải bảo trì. Chọn Gherkin khi nghiệp vụ thực sự viết/đọc kịch bản; nếu chỉ developer đọc, test Vitest có mã AC là đủ (chưa chạy thử Cucumber.js trong lab).

## 6. Quan hệ với các loại test khác

| AC | Test chính | Test bổ trợ |
|---|---|---|
| AC-ORD-3 (giảm giá) | acceptance (use case) | unit domain test biên 999.999/1.000.000 |
| AC-ORD-4 (thu tiền đúng 1 lần) | acceptance với `FakePaymentGateway` | contract test với gateway thật (chương 9) |
| AC-ORD-5 | acceptance | HTTP test: 409 qua HTTP, đã có trong `orders.http.test.ts` (chương 7) |

Acceptance test trả lời "yêu cầu có được thỏa không", unit test trả lời "mọi biên của quy tắc có đúng không". Hai thứ không thay thế nhau.

## 7. Trade-off

- Mỗi AC một test giữ bộ acceptance nhỏ và dễ đọc; đừng nhồi ca biên vào đây.
- Acceptance qua use case nhanh nhưng không chứng minh HTTP/DB nối đúng; cần thêm test mỏng ở layer đó.
- Gắn mã AC trong tên test thêm chút kỷ luật nhưng mua được traceability gần như miễn phí.
- KHÔNG nên viết AC mơ hồ ("hệ thống phản hồi nhanh"): không thể có test deterministic.

## 8. Cạm bẫy

- AC thay đổi mà test không đổi theo (test bị drift khỏi yêu cầu). Review PR sửa AC phải kèm sửa test.
- Test acceptance chứa implementation detail (kiểm tra SQL, tên class) làm nó vỡ khi refactor.
- Một test kiểm tra nhiều AC cùng lúc: không biết AC nào hỏng.
- Dùng dữ liệu "ma thuật" khó hiểu trong Given; dùng số có ý nghĩa (1.200.000 vượt ngưỡng 1.000.000).

## 9. Tóm tắt

- Acceptance test mô tả hành vi theo ngôn ngữ nghiệp vụ; với Hexagonal, điểm vào là use case.
- Quy ước: một AC, một test, mã AC làm tiền tố tên test.
- Bidirectional traceability; script đơn giản đã đủ để phát hiện AC chưa có test.
- Acceptance bổ sung chứ không thay unit test hay integration test.

## 10. Câu hỏi tự kiểm tra

1. Tại sao dùng use case làm điểm vào cho acceptance test thay vì HTTP?
2. Lợi ích của tiền tố `AC-ORD-5:` trong tên test là gì?
3. Backward traceability là gì và vì sao cần?
4. Khi nào nên dùng Gherkin (Cucumber.js) thay vì Vitest có mã AC?

<details><summary>Đáp án</summary>

1. Nhanh (ms), ổn định, vẫn mô tả đúng hành vi nghiệp vụ; HTTP/DB được kiểm tra riêng bằng test mỏng.
2. Chạy riêng theo AC (`vitest run -t AC-ORD-5`), và script trace đếm được AC có test hay chưa.
3. Mỗi test acceptance trỏ về một AC; tránh test orphan không ứng với yêu cầu nào.
4. Khi người nghiệp vụ trực tiếp đọc/viết kịch bản và chấp nhận chi phí bảo trì thêm lớp ngôn ngữ.
</details>
