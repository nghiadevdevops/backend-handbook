# Chapter 4. Test doubles and the mocking boundary

## 1. Scenario

`PayOrder` gọi payment gateway. Trong test ta không thể thu tiền thật. Ta cần một "diễn viên đóng thế" cho `PaymentGateway`. Nhưng cũng đừng mock mọi thứ: test đầy `expect(x).toHaveBeenCalledWith(...)` sẽ vỡ ngay khi bạn đổi tên method nội bộ.

## 2. Five kinds of test double

Thuật ngữ của Gerard Meszaros (*xUnit Test Patterns*), Fowler tóm lại trong "Mocks Aren't Stubs".

| Loại | Làm gì | Kiểm tra bằng | Ví dụ |
|---|---|---|---|
| **Dummy** | truyền cho đủ parameter, không bao giờ được dùng | không | `new Order('x', 'y')` chỉ để lấp parameter |
| **Stub** | trả câu trả lời được lập trình sẵn | không (chỉ cung cấp indirect input, tức đầu vào gián tiếp) | gateway luôn trả `true` |
| **Spy** | như stub nhưng *ghi lại* lời gọi để xem sau | assert trên bản ghi | `FakePaymentGateway.charges` |
| **Mock** | được cài *expectation* về lời gọi, tự xác minh | expectation trong double | `vi.fn()` + `toHaveBeenCalledWith` |
| **Fake** | implementation chạy thật nhưng đơn giản | state | `InMemoryOrderRepository` |

Phân biệt quan trọng theo Khorikov: **stub** cung cấp *indirect input* (incoming interaction, không nên assert), **mock/spy** ghi nhận *indirect output* (outgoing interaction, có thể assert). Không bao giờ assert việc gọi stub: đó là kiểm tra implementation detail.

## 3. When to mock and when not to

Khorikov chia dependency thành:

- **Managed** (nằm trong hệ thống, chỉ ứng dụng của bạn đụng vào): ví dụ database riêng của service. Dùng **thật** trong integration test.
- **Unmanaged** (bên ngoài nhìn thấy được): SMTP, payment gateway, message bus dùng chung, API đối tác. Giao tiếp với chúng là một phần observable behavior, nên **được phép mock/fake ở system boundary**.

Quy tắc ngắn: **chỉ mock ở system boundary, và chỉ với unmanaged dependency**. Không mock collaborator nội bộ (`Order`, `Money`, repository trong cùng process có thể thay bằng fake).

```
 [HTTP handler] -> [Use case] -> [Domain]
                       |            (no mock)
                       +--> OrderRepository  (fake/InMemory or real DB)
                       +--> PaymentGateway   (fake/mock: external boundary)
                       +--> Clock            (stub: FixedClock)
```

## 4. Mocking with Vitest 5

TypeScript có structural typing: object nào có đúng method của interface thì dùng được như implementation, nên với port nhỏ như `PaymentGateway` không cần thư viện mock nào ngoài `vi.fn()`. Lấy từ `lab/tests/application/pay-order.test.ts`:

```ts
const charge = vi.fn<PaymentGateway['charge']>().mockResolvedValue(true);

await new PayOrder(orders, { charge }).execute('o-6');

expect(charge).toHaveBeenCalledTimes(1);
expect(charge).toHaveBeenCalledWith('o-6', Money.vnd(900_000));
```

Test này kiểm tra *giao tiếp ra ngoài*: gateway bị gọi **đúng một lần** với đúng mã đơn và số tiền đã giảm. Đây là observable behavior ở boundary (thu tiền không được lặp, không được sai số), nên mock là hợp lý. Repository vẫn là fake, không mock. `vi.fn<PaymentGateway['charge']>()` được type theo chữ ký của port, nên nếu đổi chữ ký `charge` thì test không compile (`npm run typecheck`).

Lưu ý về kỷ luật: `vi.fn()` mà không có `expect` nào về lời gọi thực chất là một stub. Khi đó hãy viết cho rõ vai (`vi.fn().mockResolvedValue(true)` và không assert gì) hoặc dùng fake viết tay như mục 5. `toHaveBeenCalledWith` so sánh sâu (deep equality), nên `Money.vnd(900_000)` khớp theo giá trị chứ không theo reference.

## 5. Hand-written fakes and spies

Tại sao lab dùng `FakePaymentGateway` chứ không chỉ `vi.fn()`? Vì nó vừa là stub (điều khiển kết quả `willSucceed`) vừa là spy (ghi `charges`):

```ts
export class FakePaymentGateway implements PaymentGateway {
  readonly charges: { orderId: string; amount: Money }[] = [];
  readonly #willSucceed: boolean;

  constructor(willSucceed = true) {
    this.#willSucceed = willSucceed;
  }

  async charge(orderId: string, amount: Money): Promise<boolean> {
    this.charges.push({ orderId, amount });

    return this.#willSucceed;
  }
}
```

Nguồn: `lab/src/infrastructure/fake-payment-gateway.ts`. Dùng được lại ở nhiều test và cả ở môi trường demo/dev (`src/composition.ts` cắm nó vào khi chạy server của lab vì không có payment provider thật). Test chỉ assert kết quả: "bị thu 1 lần, 300.000" mà không bị ràng buộc cách `PayOrder` gọi.

| | `vi.fn()` | Fake/spy viết tay |
|---|---|---|
| Thiết lập | nhanh, tại chỗ | tốn công một lần, dùng lại |
| Gắn với implementation | expectation đi kèm tên method và tham số | thấp hơn: assert trên kết quả |
| Hợp với | một lời gọi ra ngoài cần xác minh chính xác | dependency dùng nhiều nơi, cần hành vi nhất quán |

## 6. Trade-offs

- Mock cho phép khẳng định chính xác giao tiếp nhưng gắn test với cách gọi: dùng tiết kiệm.
- Fake cần được **tin cậy**: một fake sai hành vi so với bản thật sẽ làm test xanh sai. Cách giữ fake trung thực: chạy cùng bộ contract test cho cả fake và adapter thật (chương 5, 6).
- Đừng bao giờ mock data type (`Money`, `Order`) hay thứ có thể tạo thật rẻ.
- `vi.mock('module')` (thay cả module) mạnh nhưng ẩn: nó hoạt động qua hoisting nên đọc code khó hiểu. Với kiến trúc có port và dependency injection như lab, truyền double qua constructor là đủ, không cần `vi.mock`.

## 7. Pitfalls

- **Assert lời gọi stub**: kiểm tra `orders.get` được gọi, vô nghĩa với hành vi.
- **Mock trả mock** (`mockReturnValue({ a: { b: vi.fn() } })`): dấu hiệu thiết kế vi phạm Law of Demeter.
- **Fake giữ object reference**: lab từng mắc lỗi này. `InMemoryOrderRepository` đầu tiên lưu chính object, nên khi `PayOrder` quên gọi `save()`, test vẫn xanh vì object đã bị sửa in-place. Bản TypeScript tái hiện đúng lỗi này (chương 5 có output thật): bỏ dòng `await this.#orders.save(order)` mà 12 test vẫn xanh. Cách sửa: fake lưu và trả về bản copy, giống DB thật.
- Dùng mock cho thứ chỉ cần stub, hoặc quên `await` trước `expect(...).rejects`: test kết thúc trước khi assertion chạy và xanh giả. Hãy luôn `await expect(...).rejects...`.

## 8. Summary

- Dummy/stub/spy/mock/fake khác nhau ở vai trò: cung cấp input, ghi nhận output, hay implementation đơn giản.
- Chỉ mock unmanaged dependency, ở system boundary; còn lại dùng object thật hoặc fake.
- Stub không assert; mock/spy assert output giao tiếp.
- Fake phải trung thực với bản thật (copy state, như DB).

## 9. Self-check questions

1. Khác nhau giữa stub và mock theo hướng dữ liệu (input/output)?
2. Vì sao mock `PaymentGateway` hợp lý còn mock `OrderRepository` thì nên tránh?
3. `vi.fn<PaymentGateway['charge']>()` có lợi gì so với `vi.fn()` trần?
4. Lỗi "fake giữ reference" làm test sai như thế nào?

<details><summary>Answer</summary>

1. Stub cung cấp indirect input cho code được test (không assert); mock xác minh indirect output (lời gọi ra ngoài).
2. Payment gateway là unmanaged dependency, lời gọi tới nó là observable behavior. Repository là persistence detail nội bộ, thay bằng fake và assert state.
3. Mock được type theo chữ ký của port: đổi chữ ký thì test không compile, và `toHaveBeenCalledWith` được gợi ý đúng kiểu tham số.
4. Object được sửa tại chỗ nên dữ liệu "đã lưu" tự cập nhật; việc quên `save()` không bị phát hiện, test xanh sai.
</details>
