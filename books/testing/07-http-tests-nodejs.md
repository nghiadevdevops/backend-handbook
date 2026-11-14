# Chương 7. Test HTTP/handler trong Node.js (Fastify, Supertest) và test cấu hình

> **Trạng thái kiểm chứng:** mọi code Fastify, `app.inject`, Supertest và test composition root trong chương này là code thật trong `lab/`, đã chạy xanh (Fastify 5.12.8, Supertest 7.3.2, Vitest 5.1.0). Chỉ mục 6 (NestJS `Test.createTestingModule`) là mẫu theo docs, **chưa chạy thử**. (Tên file chương giữ nguyên `07-http-tests-nodejs.md` để không vỡ link; nội dung đã viết lại cho stack Node.js.)

## 1. Tình huống

Use case đã xanh, adapter đã xanh, nhưng POST `/orders` vẫn trả 500: quên truyền `OrderRepository` thật vào `buildApp`, route thiếu hook auth, schema validation không khớp body mà client gửi. Những lỗi này nằm ở **glue layer của framework**, nơi mọi mảnh ghép gặp nhau. Cần một ít test đi qua toàn bộ stack HTTP.

## 2. HTTP handler trong Hexagonal là driving adapter

Handler chỉ nên: validate input → gọi use case → map kết quả/exception thành HTTP. Vì business logic đã được test ở các layer dưới, **HTTP test chỉ kiểm tra phần HTTP**:

| Cần kiểm tra | Ví dụ |
|---|---|
| Routing + method | `POST /orders` tồn tại |
| Validation | thiếu `lines` hoặc `lines` rỗng → 400 với lỗi đúng trường |
| Error mapping của domain | `DomainError` → 409, `OrderNotFound` → 404 |
| Status code + JSON shape | 201, body có `id`, `status` |
| Auth/hook | không có token → 401 |
| Wiring | composition root chọn đúng adapter |

KHÔNG lặp lại các ca nghiệp vụ (ngưỡng giảm giá...) ở đây.

## 3. Lựa chọn công cụ (11/2026)

| Cách | Mô tả | Khi nào chọn |
|---|---|---|
| `app.inject()` của Fastify | dựng request giả (light-my-request) và đẩy qua pipeline của Fastify, không mở socket | Fastify; nhanh nhất, không cần dependency thêm |
| Supertest 7.3.2 | bắt tay với `http.Server` thật trên cổng ngẫu nhiên trong process test | Express/Koa/Fastify; giữ được test nếu đổi framework |
| `fetch` tới server `listen()` thật | đi qua cả TCP | smoke test hiếm hoi; Pact provider verify (chương 9) làm đúng như vậy |
| NestJS `Test.createTestingModule` | dựng module DI, thay provider bằng fake, rồi `app.inject`/Supertest | dự án Nest (mục 6) |

Lab dùng Fastify làm ví dụ chính vì nó có sẵn `inject`; Express 5.3.0 và Supertest hoạt động theo cùng mô hình (`request(app)`), nên các nguyên tắc dưới đây áp dụng như nhau.

## 4. Test bằng `app.inject`

Handler của lab (`lab/src/http/app.ts`) nhận mọi dependency qua `buildApp(deps)`, nên test dựng app với fake mà không cần container DI:

```ts
const makeApp = (payments: FakePaymentGateway) =>
  buildApp({
    orders,
    payments,
    clock: new FixedClock(new Date('2026-11-07T08:00:00+00:00')),
    apiToken: 'test-token',
  });
```

Test đặt đơn và kiểm tra JSON shape (`lab/tests/http/orders.http.test.ts`):

```ts
it('POST /orders places an order and returns 201 with the contract shape', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: AUTH,
    payload: { id: 'o-1', customerId: 'c-1', lines: [{ sku: 'A', quantity: 2, unitPrice: 100_000 }] },
  });

  expect(res.statusCode).toBe(201);
  expect(res.json()).toEqual({
    id: 'o-1',
    status: 'placed',
    total: 200_000,
    currency: 'VND',
    lines: [{ sku: 'A', quantity: 2, unitPrice: 100_000 }],
  });
});

it('rejects an empty cart with 400 and names the field', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: AUTH,
    payload: { id: 'o-2', customerId: 'c-1', lines: [] },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json().message).toContain('body/lines');
});

it('maps a domain error to 409', async () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ sku: `S${i}`, quantity: 1, unitPrice: 1_000 }));

  const res = await app.inject({ method: 'POST', url: '/orders', headers: AUTH, payload: { id: 'o-3', customerId: 'c-1', lines: six } });

  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: 'Don toi da 5 dong' });
});
```

Trong cùng file còn các ca: sai kiểu dữ liệu (400), `OrderNotFound` (404), không có hoặc sai bearer token ở mọi route `/orders` (401), thanh toán qua `FakePaymentGateway` (200 và gateway bị thu đúng 1 lần), thanh toán bị từ chối (409 và đơn vẫn `placed`). Tổng 8 test, chạy trong khoảng một giây.

**Một lỗi thật mà test này đã bắt.** Lần chạy đầu, ca "sai kiểu dữ liệu" (`quantity: '2'` là string) trả **201** chứ không phải 400. Lý do: Ajv của Fastify bật `coerceTypes` mặc định, nên chuỗi `"2"` âm thầm được ép thành số `2`. Với API JSON thì đó là hành vi ta không muốn (client gửi sai kiểu mà không biết). Sửa một dòng trong `buildApp`: `Fastify({ ajv: { customOptions: { coerceTypes: false } } })`, test xanh. Nếu viết test chỉ với ca `lines: []` thì lỗi này lọt.

`app.inject` không mở cổng nên dùng song song nhiều file test không đụng nhau. Nhớ `await app.ready()` trước và `await app.close()` sau mỗi test (đã làm ở `beforeEach/afterEach`) để hook và plugin được khởi tạo và dọn đúng.

### Supertest

Cùng ranh giới, qua Supertest (`lab/tests/http/supertest.http.test.ts`):

```ts
await request(app.server)
  .post('/orders')
  .set('authorization', 'Bearer test-token')
  .send(body)
  .expect(201)
  .expect('content-type', /application\/json/);

const res = await request(app.server).get('/orders/st-1').set('authorization', 'Bearer test-token').expect(200);
expect(res.body).toMatchObject({ id: 'st-1', status: 'placed', total: 1_080_000 });
```

Với Fastify, truyền `app.server` (đối tượng `http.Server`) sau khi `app.ready()`. Với Express, truyền thẳng `app`. Supertest tự bind cổng ngẫu nhiên và đóng lại sau request. Khác biệt với `inject`: có TCP thật (chậm hơn một chút, nhưng bắt được lỗi ở tầng `http.Server` như keep-alive hay header) và dùng được cho mọi framework. Hai test của file này chạy xanh.

Lưu ý `.expect(201)` trong Supertest ném lỗi nếu sai status, nhưng chỉ khi bạn `await` cả chuỗi (hoặc `return` nó). Quên `await` là cách phổ biến nhất để có test xanh giả. Một chi tiết nữa: `.expect()` của Supertest là assertion riêng của nó, **không** được Vitest đếm; test chỉ có `.expect(401)` bị `expect.requireAssertions` báo đỏ (`expected any number of assertion, but got none`, đã gặp thật khi chạy bộ test đầy đủ), nên lab thêm một `expect(res.status).toBe(401)` của Vitest.

## 5. Thay external dependency và test phần cấu hình

Payment gateway không được gọi thật: `buildApp` nhận `payments: PaymentGateway`, nên test truyền `FakePaymentGateway`. Cách này giữ nguyên nguyên tắc chương 4: fake ở boundary, còn DB (khi cần) thì là thật. Không có "container DI" ma thuật nào để tự cấu hình sai, nhưng vẫn có glue: file `lab/src/composition.ts` đọc environment và quyết định adapter nào cắm vào port nào. Đây là loại lỗi "chạy trên máy tôi" rất hay gặp, và test của nó rẻ (`lab/tests/http/composition.test.ts`):

```ts
it('binds OrderRepository to the Postgres adapter when DATABASE_URL is set', () => {
  const deps = composeFromEnv({ API_TOKEN: 't', DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

  expect(deps.orders).toBeInstanceOf(PostgresOrderRepository);
});

it('fails fast when API_TOKEN is missing', () => {
  expect(() => composeFromEnv({})).toThrow(ConfigError);
  expect(() => composeFromEnv({ API_TOKEN: '' })).toThrow('Thieu API_TOKEN');
});
```

Test này không cần PostgreSQL chạy vì `pg.Pool` kết nối lười (lazy): tạo pool không mở connection. Hàm nhận `env` làm tham số thay vì đọc `process.env` trực tiếp, nên test truyền object tùy ý mà không phải sửa biến môi trường toàn cục.

Hai ý tưởng khác: smoke test khởi động `node src/server.ts` thật và gọi `GET /` (chương 12 làm gián tiếp bằng Playwright), và kiểm tra `tsc --noEmit` trong CI để bắt lỗi chữ ký giữa handler và use case trước khi chạy test.

## 6. NestJS (chưa chạy thử)

Nếu dự án dùng NestJS (`@nestjs/testing` 12.4.0 ở 11/2026), ý tưởng giống hệt: thay provider bằng fake, gọi qua HTTP in-process. Mẫu theo docs, chưa chạy trong lab:

```ts
// Minh họa, CHƯA chạy trong lab này
const moduleRef = await Test.createTestingModule({ imports: [OrdersModule] })
  .overrideProvider(PaymentGateway)
  .useValue(new FakePaymentGateway(true))
  .compile();

const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
await app.init();
await app.getHttpAdapter().getInstance().ready();

const res = await app.inject({ method: 'POST', url: '/orders', payload: { /* ... */ } });
```

Điểm khác: Nest dùng decorator và DI container, nên "lỗi wiring" (thiếu `@Injectable()`, thiếu provider trong module) mới thực sự xuất hiện lúc `compile()`; test `Test.createTestingModule(...).compile()` thành công đã là một smoke test cấu hình hữu ích. Vitest cần cấu hình thêm cho decorator metadata (`emitDecoratorMetadata`), nên đó là lý do lab không đưa Nest vào.

## 7. Trade-off

- HTTP test chậm hơn use case test; giữ ở mức vài cái mỗi endpoint (happy path, validation, một lỗi domain, auth).
- Handler mỏng thì HTTP test mỏng. Nếu bạn phải viết nhiều HTTP test để kiểm tra business logic, có lẽ logic đang nằm sai chỗ (trong handler).
- Gọi qua HTTP in-process (`inject`, hoặc Supertest với cổng ngẫu nhiên) nhanh hơn E2E nhiều và đủ cho đa số lỗi wiring.

## 8. Cạm bẫy

- Test business logic qua HTTP: chậm, vỡ khi đổi định dạng response dù logic đúng.
- Quên `await` với `inject`/Supertest/`rejects`: test xanh giả.
- Dùng cổng cố định (`listen({ port: 3000 })`) trong test: chạy song song đụng nhau. Dùng cổng 0 hoặc `inject`.
- Quên `app.close()`: Vitest treo hoặc báo handle rò rỉ.
- Tin vào validation mặc định: `coerceTypes` (như trên) hoặc `removeAdditional` có thể làm request sai vẫn lọt; hãy test ca sai kiểu, không chỉ ca thiếu field.
- Dùng SQLite cho HTTP test trong khi production là PostgreSQL (nhắc lại chương 6).
- HTTP test phụ thuộc thứ tự chạy hoặc dữ liệu seed chung. Mỗi test của lab tự tạo `InMemoryOrderRepository` mới.

## 9. Tóm tắt

- HTTP test đi qua toàn stack HTTP để bắt lỗi wiring, validation, error mapping, auth.
- Handler mỏng nên HTTP test mỏng; business logic test ở layer dưới.
- `app.inject` (Fastify) là cách nhanh nhất; Supertest dùng được cho mọi framework Node.
- Truyền dependency qua tham số (`buildApp(deps)`, `composeFromEnv(env)`) để test thay fake mà không cần mock module.
- Test cấu hình rẻ nhưng bắt lỗi "chạy trên máy tôi". Lab đã bắt được một lỗi thật (`coerceTypes`).
- NestJS: cùng ý tưởng, mẫu code chưa chạy thử.

## 10. Câu hỏi tự kiểm tra

1. HTTP test nên kiểm tra những gì mà test use case không làm được?
2. Vì sao không nên test ngưỡng giảm giá qua HTTP?
3. Khác biệt giữa `app.inject` và Supertest?
4. Vì sao `composeFromEnv` nhận `env` làm tham số?
5. Ca nào trong lab đã phát hiện `coerceTypes`, và sửa thế nào?

<details><summary>Đáp án</summary>

1. Routing, validation, hook/auth, map lỗi sang HTTP status code, định dạng JSON, wiring của composition root.
2. Chậm và brittle; ngưỡng đã được unit test ở domain, HTTP chỉ cần kiểm tra mapping.
3. `inject` đi qua pipeline của Fastify mà không có socket (nhanh, chỉ Fastify); Supertest bind một `http.Server` thật trên cổng ngẫu nhiên và dùng được với mọi framework.
4. Để test truyền object tùy ý thay vì sửa `process.env` toàn cục, nên các test không ảnh hưởng nhau và không cần dọn.
5. Ca `quantity: '2'` trả 201 thay vì 400; sửa bằng `Fastify({ ajv: { customOptions: { coerceTypes: false } } })`.
</details>
