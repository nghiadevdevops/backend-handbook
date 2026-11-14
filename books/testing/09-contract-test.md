# Chapter 9. Contract tests between services (Pact JS) and schema tests

> **Trạng thái kiểm chứng:** schema test (mục 3) và luồng Pact consumer + provider (mục 4) là code thật trong `lab/`, đã chạy xanh với `@pact-foundation/pact` 17.1.4 (Vitest 5.1.0, Node 26). Phần **Pact Broker** và `can-i-deploy` (mục 5) **chưa chạy thử** (cần một broker); mô tả theo docs.pact.io. Lab dùng pact file cục bộ thay cho broker.

## 1. Scenario

Service `order` đổi `total` từ số nguyên sang chuỗi `"1080000.00"`. Test của `order` xanh, test của web-shop (consumer) xanh vì nó dùng mock cũ. Lên production: web-shop vỡ. Dựng môi trường E2E cho mọi cặp service thì chậm và brittle. Contract test giải quyết đúng chỗ này: kiểm tra từng cặp consumer-provider **độc lập, không cần chạy cả hai cùng lúc**.

## 2. Two approaches

| | Schema test (phía provider) | Consumer-driven contract (Pact) |
|---|---|---|
| Ai định nghĩa contract | provider (OpenAPI, JSON Schema, hoặc object khai báo) | **consumer** nói rõ nó cần gì |
| Phát hiện | provider đổi sai schema | provider đổi thứ mà consumer *thật sự dùng* |
| Công cụ | Vitest thường, Ajv/Zod, OpenAPI validator | Pact (mock server, verifier, broker) |
| Chi phí | thấp | cao hơn: native binary, process, broker |

Hợp lý nhất: schema test cho mọi service (rẻ), Pact cho những cặp consumer-provider quan trọng, thuộc nhóm khác nhau.

## 3. Schema tests

`presentOrder` (`lab/src/application/order-presenter.ts`) là JSON shape mà client nhìn thấy. `lab/tests/contract/schema.test.ts` pin nó lại:

```ts
const CONTRACT = {
  id: 'string',
  status: 'string',
  total: 'number',
  currency: 'string',
  lines: 'array',
} as const;

const LINE_CONTRACT = {
  sku: 'string',
  quantity: 'number',
  unitPrice: 'number',
} as const;

function assertShape(contract: Record<string, JsonType>, actual: Record<string, unknown>): void {
  for (const [field, type] of Object.entries(contract)) {
    expect(actual, `Thieu truong '${field}'`).toHaveProperty(field);
    expect(typeOf(actual[field]), `Sai kieu o '${field}'`).toBe(type);
  }
}

it('satisfies consumer contract', () => {
  const payload = presentOrder(OrderBuilder.anOrder().placed().build());

  assertShape(CONTRACT, payload as unknown as Record<string, unknown>);
  expect(payload.lines.length).toBeGreaterThan(0);
  for (const line of payload.lines) {
    assertShape(LINE_CONTRACT, line as unknown as Record<string, unknown>);
  }
});
```

Thiết kế có chủ đích: kiểm tra **subset** consumer cần (thiếu field hoặc sai type thì đỏ; thêm field mới thì vẫn xanh), đúng tinh thần "robustness principle" ở API boundary. JSON không có kiểu "integer" riêng, nên `typeOf` coi số nguyên là `'number'` và số lẻ là kiểu khác để `total: 1080000.5` cũng đỏ. Test thứ hai của file chứng minh chính nó bắt được ca đề bài:

```ts
it('detects a field that changed type (total as string)', () => {
  const payload = { ...presentOrder(OrderBuilder.anOrder().placed().build()), total: '1080000.00' };

  expect(() => assertShape(CONTRACT, payload as unknown as Record<string, unknown>)).toThrow(
    "Sai kieu o 'total'",
  );
});
```

Trong thực tế bạn nên sinh/kiểm tra từ một machine-readable specification như OpenAPI hoặc JSON Schema thay vì object viết tay, để tài liệu và test không lệch nhau (ví dụ validate response bằng Ajv với schema từ file OpenAPI; mình chưa chạy thử trong lab). Lab này đã dùng JSON Schema ở phía *request* (`placeBodySchema` trong `src/http/app.ts`), đó là một nửa của bài toán.

## 4. Pact JS: the consumer-driven flow (run)

```
 Consumer (web-shop)                      Provider (order-service)
 ---------------------------              -------------------------------
 1. viết test với MOCK SERVER của Pact     4. Verifier "replay" từng
    mô tả: "khi GET /orders/o-1 thì           request trong file pact vào
    tôi cần JSON có id, status, total"        provider THẬT (stub ở DB/external boundary)
 2. test chạy -> sinh file pact (JSON)     5. so sánh response với expectation
 3. publish pact lên Pact Broker  -------> 6. báo kết quả về broker
                                           7. can-i-deploy: cho phép/chặn deploy
```

Trong lab, bước 3 và 6 được thay bằng file `pacts/web-shop-order-service.json` trên đĩa. Toàn bộ nằm trong `lab/tests/contract/pact/order.pact.test.ts`; consumer-side code thật là `lab/src/infrastructure/http-order-client.ts` (class `HttpOrderClient`, gọi `fetch`).

**Phía consumer** (API `PactV4`):

```ts
const { like, integer, string, eachLike } = MatchersV3;
const pact = new PactV4({ consumer: 'web-shop', provider: 'order-service', dir: PACT_DIR });

await pact
  .addInteraction()
  .given('order o-1 is placed')
  .uponReceiving('a request for order o-1')
  .withRequest('GET', '/orders/o-1', (b) => {
    b.headers({ authorization: `Bearer ${TOKEN}` });
  })
  .willRespondWith(200, (b) => {
    b.jsonBody({
      id: like('o-1'),
      status: like('placed'),
      total: integer(100_000),
      currency: string('VND'),
      lines: eachLike({ sku: string('SKU-1'), quantity: integer(1), unitPrice: integer(100_000) }),
    });
  })
  .executeTest(async (mockServer) => {
    // The REAL consumer client code runs against the mock server.
    const order = await new HttpOrderClient(mockServer.url, TOKEN).get('o-1');

    expect(order.status).toBe('placed');
    expect(order.total).toBe(100_000);
  });
```

Điểm mấu chốt: test phía consumer kiểm tra *client code thật của consumer* với mock server, và việc đó đồng thời **sinh ra contract**. Matcher (`like`, `integer`, `string`, `eachLike`) cho phép khớp theo *type* thay vì giá trị cố định, tránh contract brittle: file pact sinh ra có `matchingRules` như `"$.total": { "match": "integer" }` và `"$.lines": { "match": "type", "min": 1 }`.

**Phía provider:** `Verifier` đọc file pact, gọi một instance `buildApp` **thật** (Fastify, lắng nghe cổng ngẫu nhiên `127.0.0.1`) và so sánh response. Chỉ DB (fake in-memory) và gateway được thay thế, nên đây là test cho *driving adapter HTTP* của provider:

```ts
await new Verifier({
  provider: 'order-service',
  providerBaseUrl: baseUrl,
  pactUrls: [path.join(PACT_DIR, 'web-shop-order-service.json')],
  stateHandlers: {
    // Provider state: prepare the precondition the consumer declared with given().
    'order o-1 is placed': async () => {
      await orders.save(OrderBuilder.anOrder().withId('o-1').placed().build());
    },
  },
}).verifyProvider();
```

Kết quả thật (rút gọn):

```
Verifying a pact between web-shop and order-service

  a request for order o-1
     Given order o-1 is placed
    returns a response which
      has status code 200 (OK)
      has a matching body (OK)

 ✓ tests/contract/pact/order.pact.test.ts (2 tests)
```

**Thử phá hợp đồng thật.** Ta sửa `presentOrder` thành `total: String(total.amount)` (đúng tình huống ở mục 1) rồi chạy `./run.sh contract`. Cả hai lưới đều đỏ, với thông báo khác nhau:

```
FAIL  tests/contract/schema.test.ts > order response contract > satisfies consumer contract
AssertionError: Sai kieu o 'total': expected 'string' to be 'number'

      has a matching body (FAILED)
           $.total -> Expected '100000' (String) to be an integer
 × provider: the real Fastify app satisfies the pact
```

Thông báo của Pact chỉ rõ JSONPath (`$.total`) và kiểu đã thỏa thuận. Sau đó khôi phục file và chạy lại thì xanh. Nếu bạn chỉ có HTTP test kiểu chương 7 với `toEqual` trên `total: 200_000`, nó cũng đỏ; điểm khác là Pact đỏ ở **repo provider** theo contract của **consumer khác**, tức là đội provider biết mình làm vỡ ai mà không cần đọc code của họ.

"Given" (provider state) như `order o-1 is placed` là chỗ provider chuẩn bị dữ liệu: ở đây dùng `OrderBuilder` + `InMemoryOrderRepository`. Provider chạy được mà không cần consumer thật.

**Lưu ý thực tế khi chạy Pact JS:**

- Hai bước (consumer sinh file, provider đọc file) nằm trong **một file test** vì Vitest chạy các *file* song song nhưng các test trong *một file* theo thứ tự. Tách hai file thì provider có thể chạy trước khi pact file tồn tại.
- Pact JS v17 dùng native binary (Rust core) tải qua npm, nên cần image Linux glibc (`node:26` Debian chạy tốt; Alpine/musl cần kiểm tra thêm). Bản mới của pact-core tự gửi thống kê ẩn danh; đặt `PACT_DO_NOT_TRACK=true` nếu muốn tắt.
- Trong sách này contract lưu thành file; thực tế hãy publish lên Pact Broker (hoặc PactFlow) để provider lấy pact mới nhất của mọi consumer.

Trong hệ thống Hexagonal: contract test của consumer gắn vào **adapter HTTP client** (driven port → adapter gọi order-service, `HttpOrderClient`); contract test của provider gắn vào **driving adapter HTTP** (handler Fastify). Port giữ domain sạch khỏi chuyện này.

## 5. When to use Pact

Dùng khi: nhiều đội, deploy độc lập, nhiều consumer cho một provider, E2E liên service đã quá chậm/khó bảo trì. Khi đó thêm Pact Broker và bước `can-i-deploy` (chưa chạy thử trong lab) để chặn deploy một bản provider làm vỡ consumer đang chạy production.

Không dùng khi: một đội sở hữu cả hai đầu và deploy cùng nhau (schema test + HTTP test đủ); public API cho vô số consumer chưa biết (dùng OpenAPI + versioning/deprecation).

Pact cũng không thay thế test hành vi nghiệp vụ của provider: nó chỉ kiểm tra *shape và các interaction* chứ không kiểm tra logic.

## 6. Pitfalls

- Contract quá chặt (khớp giá trị chính xác thay vì type): vỡ liên tục. Dùng matcher.
- Dùng Pact như test chức năng provider (đẩy cả logic nghiệp vụ vào contract).
- Quên cập nhật provider state khi đổi dữ liệu mẫu: verifier báo lỗi 404 hoặc body lệch, rất dễ nhầm với lỗi code.
- Contract chỉ nằm trong repo consumer, không publish: provider không biết ai cần gì.
- Schema test sinh tay lệch khỏi tài liệu OpenAPI thật.
- Hai test (consumer, provider) chạy song song và đọc file pact chưa được ghi (xem lưu ý trên).

## 7. Summary

- Contract test kiểm tra cặp consumer-provider độc lập, thay cho E2E liên service.
- Schema test rẻ, kiểm tra tập con consumer cần; thêm field an toàn, đổi tên/type là vỡ.
- Pact JS: consumer viết expectation với mock server, sinh file pact, provider verify bằng `Verifier` + provider state; broker và `can-i-deploy` chặn deploy sai (broker chưa chạy thử trong lab).
- Cả schema test và luồng Pact consumer/provider trong lab đã chạy thật.

## 8. Self-check questions

1. Vì sao `assertShape` cho phép thêm field mới vào response?
2. Điểm khác biệt chính giữa schema test và Pact là gì?
3. "Provider state" trong Pact dùng để làm gì?
4. Vì sao consumer test và provider verification của lab nằm trong cùng một file?
5. Khi nào Pact là quá mức cần thiết?

<details><summary>Answer</summary>

1. Nó chỉ duyệt các field có trong contract; field dư không bị kiểm tra, nên thay đổi backward compatible không làm đỏ.
2. Pact do consumer dẫn dắt, mô tả đúng cái consumer dùng và có process broker; schema test do provider tự khai báo schema.
3. Để provider dựng dữ liệu precondition (ví dụ đơn o-1 đã đặt) trước khi verifier replay request.
4. Provider đọc file pact mà consumer ghi ra; test trong một file chạy tuần tự còn các file chạy song song, nên tách ra có thể làm provider chạy trước.
5. Khi một đội làm chủ cả hai đầu và triển khai cùng nhau.
</details>
