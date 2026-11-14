# Chapter 5. Testing use cases with fake adapters

## 1. Scenario

Use case `PlaceOrder` và `PayOrder` là orchestration layer: lấy dữ liệu qua port, gọi domain, lưu lại. Nếu test chúng bằng mock repository, bạn viết một bản sao của chính thân hàm (`expect(get)...`, `expect(save)...`). Nếu test bằng DB thật, mỗi test mất trăm ms và cần Docker. Hexagonal cho một lối ra: port là interface, nên cắm **fake adapter in-memory**, chạy mili giây mà vẫn kiểm tra kết quả thật.

## 2. Mechanics

```
 test --> PlaceOrder --> OrderRepository (port)
                           ^             ^
          InMemoryOrderRepository     PostgresOrderRepository
          (test use case)             (production, test ở chương 6)
```

Use case chỉ biết `OrderRepository`, `PaymentGateway`, `Clock` (file `lab/src/application/ports.ts`). Ba port này cắm sang fake:

| Port | Fake | Vai trò khi test |
|---|---|---|
| `OrderRepository` | `InMemoryOrderRepository` | lưu/lấy đơn trong `Map` |
| `PaymentGateway` | `FakePaymentGateway` | điều khiển kết quả, ghi lại lần thu tiền (spy) |
| `Clock` | `FixedClock` | thời điểm cố định |

Ta kiểm tra **kết quả**: đơn nào đã được lưu, trạng thái gì, gateway bị thu bao nhiêu.

Một khác biệt so với ngôn ngữ đồng bộ: trong Node.js mọi I/O đều async, nên `OrderRepository.save/get` và `PaymentGateway.charge` trả `Promise`. Điều này lan lên cả use case (`async execute`) và test (`await`). Fake in-memory cũng phải khai báo `async` để giữ đúng hình dạng của port; nếu fake trả giá trị đồng bộ, test xanh nhưng code không bao giờ được thử với `Promise` thật.

## 3. The fake repository

```ts
export class InMemoryOrderRepository implements OrderRepository {
  readonly #orders = new Map<string, Order>();

  // Store and return COPIES, like a real DB: mutating an object outside does not change
  // the "saved" data. Otherwise tests cannot detect a forgotten save().
  async save(order: Order): Promise<void> {
    this.#orders.set(order.id, copyOf(order));
  }

  async get(id: string): Promise<Order> {
    const order = this.#orders.get(id);
    if (order === undefined) {
      throw OrderNotFound.withId(id);
    }

    return copyOf(order);
  }
}

function copyOf(order: Order): Order {
  return Order.reconstitute(order.id, order.customerId, order.status, order.placedAt, order.lines);
}
```

Nguồn: `lab/src/infrastructure/in-memory-order-repository.ts`. Hai chi tiết quan trọng: (1) `get` ném `OrderNotFound` giống adapter thật; (2) lưu/trả **bản sao** để mô phỏng persistence boundary. Điều này không phải chi tiết nhỏ.

**Bài học thật, tái hiện bằng TypeScript.** Bản đầu của fake chỉ làm `this.#orders.set(order.id, order)` và `return order` (lưu reference). Ta giả lập lỗi "quên lưu" bằng cách comment dòng `await this.#orders.save(order)` trong `PayOrder.execute`, rồi chạy `vitest run tests/application tests/acceptance`:

```
 Test Files  3 passed (3)
      Tests  12 passed (12)          # fake giữ reference: bug không bị phát hiện
```

Đổi fake sang lưu/trả bản copy như trên, chạy lại cùng bug đó:

```
 × AC-ORD-4: successful payment marks order paid and charges once
 × AC-ORD-6: paid order cannot be cancelled
 × marks order paid when gateway accepts
 Test Files  2 failed | 1 passed (3)
      Tests  3 failed | 9 passed (12)   # bug bị bắt
```

Cùng một test, cùng một bug; chỉ khác fake. Chương 11 nói thêm vì sao StrykerJS không tự tìm ra lỗi này như Infection đã làm với bản PHP.

Có một chi tiết riêng của TypeScript: `Order` dùng private field `#status`, `#lines`..., nên không thể "clone" bằng spread hay `structuredClone` (private field không được sao chép). Lab dùng `Order.reconstitute(...)`, chính là factory mà adapter Postgres cũng dùng để dựng lại entity từ DB. Dùng chung đường này còn có lợi phụ: fake và adapter thật đi qua cùng cửa vào.

## 4. Testing the use case

`lab/tests/application/place-order.test.ts`:

```ts
it('saves a placed order with all lines', async () => {
  await placeOrder.execute('o-1', 'c-1', [
    { sku: 'A', quantity: 2, unitPrice: 100_000 },
    { sku: 'B', quantity: 1, unitPrice: 50_000 },
  ]);

  const saved = await orders.get('o-1');
  expect(saved.status).toBe('placed');
  expect(saved.placedAt).toEqual(now);
  expect(saved.total().amount).toBe(250_000);
});
```

Và với `PayOrder` (từ `lab/tests/application/pay-order.test.ts`): đường thành công, bị từ chối, đơn không tồn tại.

```ts
it('marks order paid when gateway accepts', async () => {
  const orders = new InMemoryOrderRepository();
  await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
  const gateway = new FakePaymentGateway(true);

  await new PayOrder(orders, gateway).execute('o-1');

  expect((await orders.get('o-1')).status).toBe('paid');
  expect(gateway.charges).toHaveLength(1);
  expect(gateway.charges[0]?.orderId).toBe('o-1');
  expect(gateway.charges[0]?.amount.amount).toBe(100_000);
});

it('keeps order placed when gateway declines', async () => {
  const orders = new InMemoryOrderRepository();
  await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
  const declined = new PayOrder(orders, new FakePaymentGateway(false)).execute('o-1');
  await expect(declined).rejects.toThrow(DomainError);
  await expect(declined).rejects.toThrow('Thanh toan bi tu choi');

  expect((await orders.get('o-1')).status).toBe('placed');
});
```

Với `noUncheckedIndexedAccess` bật trong `tsconfig.json`, `gateway.charges[0]` có kiểu `... | undefined`, nên cần `?.`: compiler buộc bạn nghĩ tới trường hợp mảng rỗng (khi đó `toBe` vẫn đỏ vì `undefined`).

Kết quả chạy thật: `./run.sh app` cho suite `application` (6 test) xanh trong khoảng một giây (phần lớn là thời gian Vitest khởi động; bản thân test mất vài chục ms).

## 5. How many tests a use case needs

Use case ít logic riêng, nên tập trung vào:

- Happy path: kết quả cuối đúng.
- Mỗi error branch của *use case* (không tồn tại, gateway từ chối) và việc nó **không** lưu gì khi lỗi.
- Thứ tự quan trọng với side effect: ví dụ không đánh dấu `paid` trước khi thu tiền thành công.

Đừng lặp lại các ca biên của domain (ngưỡng giảm giá, tối đa 5 dòng): chúng đã có ở unit test. Test use case chỉ cần một ca đại diện.

## 6. Keeping fakes honest: contract tests for the port

Fake chỉ có giá trị nếu hành vi giống adapter thật. Kỹ thuật: viết **một bộ contract test cho port** và chạy cho cả fake và adapter thật. Trong lab, bài test integration (chương 6) và test dùng `InMemory` đang tách riêng; một mở rộng tự nhiên là hàm `describeOrderRepositoryContract(name, makeRepo)` chứa các ca "lưu rồi lấy ra giống nhau", "id lạ ném `OrderNotFound`", gọi một lần cho `InMemoryOrderRepository` và một lần cho `PostgresOrderRepository`. (Lab không cài sẵn hàm này để giữ gọn; đây là gợi ý bài tập.)

## 7. Trade-offs

| | Fake in-memory | Mock repository | DB thật |
|---|---|---|---|
| Tốc độ | ms | ms | trăm ms |
| Gắn với implementation | thấp | cao | thấp |
| Bắt lỗi SQL/mapping | không | không | có |
| Chi phí duy trì | viết fake một lần | mỗi test | cần infrastructure |

Dùng fake cho test use case; dùng DB thật để test chính adapter. KHÔNG dùng fake để chứng minh SQL đúng.

## 8. Pitfalls

- Fake giữ reference (đã nói).
- Fake "thông minh" quá: nhiều logic riêng thì chính fake cần test.
- Assert vào `Map` nội bộ của fake thay vì qua `get()`.
- Quên `await` ở `expect(...).rejects` hoặc ở `orders.save(...)` khi dựng dữ liệu: test chạy trước khi dữ liệu có mặt, đỏ hoặc xanh giả tùy chỗ.
- Quên tạo test cho branch "không lưu gì khi thất bại".

## 9. Summary

- Cắm fake vào port để test use case ở tốc độ ms mà vẫn kiểm tra kết quả.
- Fake lưu/trả bản sao để mô phỏng persistence boundary.
- Chỉ test cái use case làm (orchestration, error branch, side effect), không lặp lại biên domain.
- Giữ fake đáng tin bằng contract test chung với adapter thật.

## 10. Self-check questions

1. Vì sao `InMemoryOrderRepository.get` trả bản copy?
2. Test nào của use case `PayOrder` bảo vệ rằng đơn không bị đánh dấu `paid` khi gateway từ chối?
3. Test use case có cần lặp lại ca ngưỡng 1.000.000 đ không?
4. Fake không phát hiện được loại lỗi nào mà DB thật phát hiện?

<details><summary>Answer</summary>

1. Để mô phỏng DB: sửa object bên ngoài không đổi dữ liệu đã lưu, nhờ vậy việc quên `save()` bị phát hiện.
2. `keeps order placed when gateway declines`.
3. Không; đã có unit test domain, use case chỉ cần một ca đại diện.
4. Lỗi SQL, type mapping (ví dụ `bigint` trả về dạng string), DB constraint, transaction.
</details>
