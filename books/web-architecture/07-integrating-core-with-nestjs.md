# Chapter 7. Integrating the Core with NestJS 12

> Phiên bản dùng trong sách (tra cứu 11/2026 trên npm registry và tài liệu NestJS): **Node.js 26 (LTS, Docker image `node:26`, thực tế v26.13.0)**, **TypeScript 7.0.2**, **NestJS 12.4.0** (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/testing`), `@nestjs/event-emitter` 12.0.2, `class-validator` 0.15.1, `class-transformer` 0.5.1, `pg` 8.23.1, `fastify` 5.12.8, PostgreSQL 18.6 (image `postgres:18`).

## 7.1 The problem

Core đã chạy bằng TypeScript thuần. Giờ ta cần dựng web: nhận request, validate, gọi use case, trả JSON. Việc của chương này: **nối** core với NestJS mà không để core biết NestJS.

## 7.2 NestJS 12 and the current toolchain

Những điểm của NestJS 12 ảnh hưởng đến cách dựng dự án (theo migration guide của NestJS):

- **Các package lõi của Nest được phát hành dạng ESM.** Ứng dụng CommonJS vẫn nâng cấp được nhờ `require(esm)`, nhưng lab này chọn ESM hẳn: `"type": "module"` trong `package.json` và `module: NodeNext` trong `tsconfig.json`, nên mọi `import` tương đối phải có đuôi `.js` (ví dụ `'./tokens.js'`, dù file nguồn là `tokens.ts`).
- **Node.js tối thiểu:** 20.19 hoặc 22.12 trở lên để chạy ứng dụng; lab dùng Node.js 26.
- **TypeScript:** `@nestjs/schematics` 12 (dùng bởi Nest CLI) yêu cầu TypeScript 6 làm peer dependency. Lab không dùng Nest CLI mà gọi `tsc` trực tiếp, nên dùng được TypeScript 7.0.2 (trình biên dịch native). Tác giả đã chạy `tsc --noEmit` và build thật với bản này, kể cả decorator.
- **Decorator:** NestJS vẫn dựa vào `experimentalDecorators` và `emitDecoratorMetadata`; ví dụ `tsconfig.json` ESM trong migration guide cũng bật cả hai.
- **Validation:** `ValidationPipe` với `class-validator` vẫn được hỗ trợ cho dự án dùng DTO class; NestJS 12 thêm `StandardSchemaValidationPipe` để dùng các schema theo chuẩn Standard Schema (Zod, Valibot...). Lưu ý `class-transformer` bản mới nhất (0.5.1) phát hành từ 2022: vẫn là peer dependency của `@nestjs/common`, nhưng đã lâu không có bản mới. Nếu bạn ngại phụ thuộc vào nó, `StandardSchemaValidationPipe` là hướng thay thế (sách không chạy thử hướng này).

File cấu hình dùng trong lab (`lab/tsconfig.json`, `lab/package.json`):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src", "script", "test"]
}
```

```json
{
  "name": "bookshop-lab",
  "private": true,
  "type": "module",
  "engines": { "node": ">=26" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "node --test --test-concurrency=1 \"dist/test/**/*.test.js\"",
    "demo": "node dist/script/demo.js",
    "start": "node dist/src/nest/main.js"
  },
  "dependencies": {
    "@nestjs/common": "^12.4.0",
    "@nestjs/core": "^12.4.0",
    "@nestjs/event-emitter": "^12.0.2",
    "@nestjs/platform-express": "^12.4.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "fastify": "^5.12.8",
    "pg": "^8.23.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/testing": "^12.4.0",
    "@types/node": "^26.6.6",
    "@types/pg": "^8.23.1",
    "typescript": "^7.0.2"
  }
}
```

Có một ràng buộc đáng nhớ: Node.js có thể chạy thẳng file `.ts` bằng cách xoá kiểu, nhưng cách đó **không hỗ trợ decorator** của NestJS (và `enum`, parameter property). Vì vậy dự án NestJS luôn có bước biên dịch bằng `tsc` (hoặc một công cụ tương đương) trước khi chạy.

## 7.3 Composition root: Module

Chỗ duy nhất nối port với adapter là module. Trước hết, vì interface của TypeScript biến mất lúc chạy, NestJS cần một **DI token** (một giá trị) làm khoá tra container. Lab dùng `Symbol` cho mỗi port; token nằm ở lớp NestJS, **không** nằm trong core (file `lab/src/nest/tokens.ts`):

```ts
// DI token cho từng port. Interface của TypeScript biến mất lúc chạy nên Nest cần một "giá trị"
// làm khoá tra container. Token nằm ở lớp NestJS (infrastructure), không nằm trong core.

export const ORDER_REPOSITORY = Symbol('OrderRepository');
export const EBOOK_CATALOG = Symbol('EbookCatalog');
export const ORDER_SUMMARY_READER = Symbol('OrderSummaryReader');
export const CLOCK = Symbol('Clock');
export const EVENT_PUBLISHER = Symbol('EventPublisher');
export const ORDER_NOTIFIER = Symbol('OrderNotifier');

export const PLACE_ORDER_USE_CASE = Symbol('PlaceOrderUseCase');
export const PAY_ORDER_USE_CASE = Symbol('PayOrderUseCase');
export const SEND_ORDER_CONFIRMATION = Symbol('SendOrderConfirmationWhenOrderPlaced');

export const PG_POOL = Symbol('PgPool');
```

Đánh đổi của `Symbol`: `@Inject(ORDER_REPOSITORY)` không kiểm tra kiểu, bạn có thể khai báo nhầm kiểu của tham số mà compiler không báo. Cách khác là dùng `abstract class` làm port (class tồn tại lúc chạy nên dùng được làm token), nhưng khi đó core phải khai báo `abstract class` thay vì `interface`, và `implements` đổi thành `extends`; sách chọn giữ core là interface thuần và chấp nhận đánh đổi này. Test `nest.e2e.test.ts` bắt lỗi nối sai ở mức hành vi.

Module (file `lab/src/nest/bookshop.module.ts`):

```ts
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Pool } from 'pg';
import { SendOrderConfirmationWhenOrderPlaced } from '../application/listener/send-order-confirmation-when-order-placed.js';
import { PayOrderHandler } from '../application/pay-order/pay-order-handler.js';
import { PlaceOrderHandler } from '../application/place-order/place-order-handler.js';
import type { Clock } from '../application/port/out/clock.js';
import type { EventPublisher } from '../application/port/out/event-publisher.js';
import type { OrderNotifier } from '../application/port/out/order-notifier.js';
import type { EbookCatalog } from '../domain/catalog/ebook-catalog.js';
import { EbookPurchasePolicy } from '../domain/order/ebook-purchase-policy.js';
import type { OrderRepository } from '../domain/order/order-repository.js';
import { PgEbookCatalog } from '../infrastructure/postgres/pg-ebook-catalog.js';
import { PgOrderRepository } from '../infrastructure/postgres/pg-order-repository.js';
import { PgOrderSummaryReader } from '../infrastructure/postgres/pg-order-summary-reader.js';
import { SystemClock } from '../infrastructure/time/system-clock.js';
import { LogOrderNotifier } from './log-order-notifier.js';
import { NestEventPublisher } from './nest-event-publisher.js';
import { OrderConfirmationSubscriber } from './order-confirmation.subscriber.js';
import { OrderController } from './order.controller.js';
import { PgPoolLifecycle } from './pg-pool.lifecycle.js';
import {
  CLOCK,
  EBOOK_CATALOG,
  EVENT_PUBLISHER,
  ORDER_NOTIFIER,
  ORDER_REPOSITORY,
  ORDER_SUMMARY_READER,
  PAY_ORDER_USE_CASE,
  PG_POOL,
  PLACE_ORDER_USE_CASE,
  SEND_ORDER_CONFIRMATION,
} from './tokens.js';

/**
 * Composition root phía NestJS: nối port với adapter.
 * Handler và listener của core là class TypeScript thuần (không có @Injectable),
 * nên được dựng bằng useFactory + inject theo token.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [OrderController],
  providers: [
    // Hạ tầng dùng chung
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: process.env['DATABASE_URL'] }) },
    PgPoolLifecycle,
    NestEventPublisher,
    OrderConfirmationSubscriber,

    // Secondary port -> adapter (mặc định provider là singleton trong Nest)
    { provide: ORDER_REPOSITORY, useFactory: (pool: Pool) => new PgOrderRepository(pool), inject: [PG_POOL] },
    { provide: EBOOK_CATALOG, useFactory: (pool: Pool) => new PgEbookCatalog(pool), inject: [PG_POOL] },
    { provide: ORDER_SUMMARY_READER, useFactory: (pool: Pool) => new PgOrderSummaryReader(pool), inject: [PG_POOL] },
    { provide: CLOCK, useClass: SystemClock },
    { provide: EVENT_PUBLISHER, useExisting: NestEventPublisher },
    { provide: ORDER_NOTIFIER, useClass: LogOrderNotifier },

    // Primary port -> handler của core
    {
      provide: PLACE_ORDER_USE_CASE,
      useFactory: (orders: OrderRepository, catalog: EbookCatalog, clock: Clock, events: EventPublisher) =>
        new PlaceOrderHandler(orders, catalog, new EbookPurchasePolicy(orders), clock, events),
      inject: [ORDER_REPOSITORY, EBOOK_CATALOG, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: PAY_ORDER_USE_CASE,
      useFactory: (orders: OrderRepository, clock: Clock, events: EventPublisher) =>
        new PayOrderHandler(orders, clock, events),
      inject: [ORDER_REPOSITORY, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: SEND_ORDER_CONFIRMATION,
      useFactory: (notifier: OrderNotifier) => new SendOrderConfirmationWhenOrderPlaced(notifier),
      inject: [ORDER_NOTIFIER],
    },
  ],
  exports: [PLACE_ORDER_USE_CASE, PAY_ORDER_USE_CASE],
})
export class BookshopModule {}
```

Các quyết định đáng nói:

- **Handler và listener của core không có decorator.** Chúng là class TypeScript thuần, nên module dựng chúng bằng `useFactory` + `inject` theo token. Cách này giữ đúng quy tắc "core không biết framework"; đổi lại, danh sách `inject` phải khớp thứ tự tham số constructor (compiler kiểm tra kiểu của tham số factory, nên lệch kiểu sẽ báo lỗi, còn lệch thứ tự giữa hai kiểu giống nhau thì không).
- **Adapter của NestJS thì dùng decorator.** `NestEventPublisher`, `OrderConfirmationSubscriber`, `LogOrderNotifier`, `OrderController` nằm ngoài core, được phép `@Injectable()`, `@Inject()`.
- **`useClass` / `useFactory` / `useExisting`.** `useClass` để Nest tự `new` (`SystemClock`, `LogOrderNotifier`); `useFactory` khi cần tự lắp tham số; `useExisting` tạo bí danh (token `EVENT_PUBLISHER` trỏ tới provider `NestEventPublisher`).
- **Connection pool là một provider** (`PG_POOL`), kèm `PgPoolLifecycle` để đóng pool khi `app.close()`. Nếu không đóng, process không thoát.
- **Scope mặc định của provider trong NestJS là singleton**: một instance dùng chung cho cả ứng dụng. Điều này khác với `bind` của một số container khác tạo object mới mỗi lần resolve; xem 7.4.

Điểm vào của ứng dụng (`lab/src/nest/main.ts`) và cấu hình pipe dùng chung với test (`lab/src/nest/configure-app.ts`):

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BookshopModule } from './bookshop.module.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(BookshopModule);
configureApp(app);
app.enableShutdownHooks();
await app.listen(Number(process.env['PORT'] ?? 3000));
```

```ts
import { type INestApplication, ValidationPipe } from '@nestjs/common';

/** Cấu hình dùng chung cho main.ts và test, để test chạy đúng pipeline của production. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // bỏ field lạ
      forbidNonWhitelisted: true, // và báo lỗi 400 nếu có field lạ
      transform: true, // body thành instance của DTO
    }),
  );
}
```

Top-level `await` dùng được vì lab là ESM.

## 7.4 Singleton providers and testing with InMemory

Provider mặc định là singleton nên cùng một `InMemoryOrderRepository` được cấp cho mọi nơi inject (handler, `EbookPurchasePolicy` bên trong handler, test). Nếu bạn cấu hình scope `TRANSIENT` hay `REQUEST` cho repository in-memory, mỗi lần resolve sẽ ra một repository khác nhau và dữ liệu lưu ở chỗ này không thấy ở chỗ kia: test đỏ khó hiểu. Với repository in-memory hãy giữ singleton, hoặc truyền sẵn một instance bằng `overrideProvider(...).useValue(...)`.

Test thay adapter thật bằng InMemory ngay trong container, rồi gọi HTTP thật vào ứng dụng (file `lab/test/nest.e2e.test.ts`; không cần PostgreSQL):

```ts
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PayOrderUseCase } from '../src/application/port/in/pay-order-use-case.js';
import type { OrderSummary } from '../src/application/query/order-summary.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { Money } from '../src/domain/shared/money.js';
import { InMemoryEbookCatalog } from '../src/infrastructure/in-memory/in-memory-ebook-catalog.js';
import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { InMemoryOrderSummaryReader } from '../src/infrastructure/in-memory/in-memory-order-summary-reader.js';
import { RecordingOrderNotifier } from '../src/infrastructure/in-memory/recording-order-notifier.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';
import { BookshopModule } from '../src/nest/bookshop.module.js';
import { configureApp } from '../src/nest/configure-app.js';
import {
  CLOCK,
  EBOOK_CATALOG,
  ORDER_NOTIFIER,
  ORDER_REPOSITORY,
  ORDER_SUMMARY_READER,
  PAY_ORDER_USE_CASE,
} from '../src/nest/tokens.js';

describe('NestJS: controller, DI token, ValidationPipe và event', () => {
  let app: INestApplication;
  let baseUrl: string;
  const notifier = new RecordingOrderNotifier();

  before(async () => {
    const orders = new InMemoryOrderRepository();
    const catalog = new InMemoryEbookCatalog();
    catalog.add(new Ebook(EbookId.of('e1'), 'Sách 1', Money.vnd(100)));
    catalog.add(new Ebook(EbookId.of('e2'), 'Sách 2', Money.vnd(250)));

    // Thay adapter thật bằng InMemory ngay trong container, như test feature của framework.
    const moduleRef = await Test.createTestingModule({ imports: [BookshopModule] })
      .overrideProvider(ORDER_REPOSITORY)
      .useValue(orders)
      .overrideProvider(EBOOK_CATALOG)
      .useValue(catalog)
      .overrideProvider(ORDER_SUMMARY_READER)
      .useValue(new InMemoryOrderSummaryReader(orders))
      .overrideProvider(ORDER_NOTIFIER)
      .useValue(notifier)
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(new Date('2026-11-07T09:30:00Z')))
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  after(async () => {
    await app.close();
  });

  const post = (body: unknown, customer: string | null = 'c1') =>
    fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(customer === null ? {} : { 'x-customer-id': customer }) },
      body: JSON.stringify(body),
    });

  test('POST /orders hợp lệ trả 201, listener qua @OnEvent gọi notifier', async () => {
    const response = await post({ ebookIds: ['e1', 'e2'] });
    assert.equal(response.status, 201);
    const { orderId } = (await response.json()) as { orderId: string };
    assert.match(orderId, /^[0-9a-f-]{36}$/);
    assert.equal(notifier.sent.length, 1);
    assert.match(notifier.sent[0] ?? '', /350 VND/);
  });

  test('ValidationPipe chặn body sai hình dạng bằng 400', async () => {
    assert.equal((await post({ ebookIds: [] })).status, 400);
    assert.equal((await post({ ebookIds: ['e1', 'e1'] })).status, 400);
    assert.equal((await post({ ebookIds: [1] })).status, 400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ ebookIds: ['e1'], extra: true })).status, 400);
  });

  test('Thiếu danh tính trả 401', async () => {
    assert.equal((await post({ ebookIds: ['e1'] }, null)).status, 401);
  });

  test('Luật nghiệp vụ vi phạm trả 422 (e-book không tồn tại)', async () => {
    const response = await post({ ebookIds: ['khong-co'] }, 'c3');
    assert.equal(response.status, 422);
  });

  test('Không mua lại sách đã trả tiền: 422, và GET /orders trả read model', async () => {
    const created = await post({ ebookIds: ['e1'] }, 'c2');
    const { orderId } = (await created.json()) as { orderId: string };
    await app.get<PayOrderUseCase>(PAY_ORDER_USE_CASE).handle({ orderId, paymentReference: 'PAY-1' });

    const again = await post({ ebookIds: ['e1'] }, 'c2');
    assert.equal(again.status, 422);
    assert.match(JSON.stringify(await again.json()), /đã mua/);

    const list = await fetch(`${baseUrl}/orders`, { headers: { 'x-customer-id': 'c2' } });
    const summaries = (await list.json()) as OrderSummary[];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.status, 'paid');
  });
});
```

Ghi chú: `app.listen(0)` cho hệ điều hành chọn cổng trống, nên test không chiếm cổng cố định; `fetch` có sẵn trong Node.js nên không cần thêm thư viện test HTTP. `FixedClock` thay `SystemClock`, `RecordingOrderNotifier` thay `LogOrderNotifier`; cả hai đều được inject qua đúng token.

## 7.5 DTOs, ValidationPipe, routes and controllers

Validate **hình dạng** dữ liệu vào bằng DTO + `ValidationPipe`, ở rìa (file `lab/src/nest/place-order.dto.ts`):

```ts
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Kiểm tra HÌNH DẠNG dữ liệu vào. Luật nghiệp vụ (đã sở hữu chưa...) nằm ở core. */
export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(64, { each: true })
  ebookIds!: string[];
}
```

Luật nghiệp vụ ("đã sở hữu chưa") **không** nằm ở đây mà ở core; DTO chỉ chắn dữ liệu rác. Với `whitelist` và `forbidNonWhitelisted` trong `configureApp`, field lạ cũng bị từ chối. Test `ValidationPipe chặn body sai hình dạng bằng 400` kiểm chứng: mảng rỗng, trùng, phần tử không phải chuỗi, thiếu field, thừa field đều trả 400.

Đây cũng là câu trả lời cho giới hạn ở chương 2: TypeScript chỉ kiểm kiểu **lúc compile**, còn body JSON từ mạng có thể là bất cứ thứ gì. Rìa của ứng dụng (DTO + pipe) là nơi biến dữ liệu "chưa biết kiểu" thành dữ liệu có hình dạng đã kiểm; core tin hình dạng đó và vẫn tự bảo vệ bằng `parseIdentifier` ở những nơi nhạy cảm. Chú ý `@Body() body: PlaceOrderDto` cần `PlaceOrderDto` là **class** (không phải interface), vì NestJS đọc metadata kiểu lúc chạy để chọn bộ validate.

Route khai báo bằng decorator trên controller (`@Controller('orders')`, `@Get()`, `@Post()`); controller đã xem ở chương 6. Lỗi nghiệp vụ (`DomainRuleViolation`) được controller chuyển thành 422; lỗi hình dạng đã bị pipe chặn trước bằng 400. Cách khác, đặt việc dịch lỗi vào một exception filter (`@Catch(DomainRuleViolation)`) dùng chung cho mọi controller; sách giữ `try/catch` trong controller cho dễ đọc. Danh tính khách lấy từ header `x-customer-id` cho gọn; ứng dụng thật dùng Guard xác thực.

## 7.6 Clock, events and PostgreSQL in NestJS

- **Clock:** `SystemClock` dùng `new Date()`, không cần thư viện nào. Test đóng băng thời gian bằng `FixedClock` qua port, không cần mock global timer.
- **Event:** adapter `NestEventPublisher` và subscriber `OrderConfirmationSubscriber` xem ở chương 8.
- **PostgreSQL:** `PgOrderRepository`, `PgEbookCatalog`, `PgOrderSummaryReader` (chương 3, 4) nhận `Pool` của `pg` qua provider `PG_POOL`. Lab có test nối module thật với PostgreSQL, không override provider nào (file `lab/test/nest.postgres.test.ts`, chỉ chạy khi có biến `DATABASE_URL`).

```ts
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import type { OrderSummary } from '../src/application/query/order-summary.js';
import { BookshopModule } from '../src/nest/bookshop.module.js';
import { configureApp } from '../src/nest/configure-app.js';
import { PG_POOL } from '../src/nest/tokens.js';

// Module NestJS thật, không override gì: adapter PostgreSQL + EventEmitter + SystemClock.
const skip = process.env['DATABASE_URL'] === undefined;

describe('NestJS + PostgreSQL (không override provider)', { skip }, () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [BookshopModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const pool = app.get<Pool>(PG_POOL);
    await pool.query('DROP TABLE IF EXISTS order_lines, orders, ebooks');
    await pool.query(await readFile('db/schema.sql', 'utf8'));
    await pool.query("INSERT INTO ebooks VALUES ('ddd-101', 'DDD nhập môn', 120000, 'VND'), ('hexa-201', 'Kiến trúc lục giác', 95000, 'VND')");
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  after(async () => {
    await app.close();
  });

  test('đặt đơn rồi đọc lại qua read model', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-customer-id': 'cus-1' },
      body: JSON.stringify({ ebookIds: ['ddd-101', 'hexa-201'] }),
    });
    assert.equal(response.status, 201);

    const list = await fetch(`${baseUrl}/orders`, { headers: { 'x-customer-id': 'cus-1' } });
    const summaries = (await list.json()) as OrderSummary[];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.totalAmount, 215000);
    assert.deepEqual(summaries[0]?.titles, ['DDD nhập môn', 'Kiến trúc lục giác']);
  });
});
```

## 7.7 Business errors and programming errors in TypeScript

JavaScript chỉ có một lớp gốc `Error`, không tách `Exception` và `Error` như một số ngôn ngữ. Sách dùng hai lớp riêng (file `lab/src/domain/shared/errors.ts`):

```ts
/**
 * Vi phạm quy tắc nghiệp vụ: lỗi "dự kiến", adapter bắt có chủ đích rồi dịch ra HTTP 422, thông báo trên CLI...
 */
export class DomainRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Tham số sai kiểu/giá trị (lỗi lập trình hoặc dữ liệu chưa qua validate ở rìa).
 * Khác DomainRuleViolation: đừng catch để "cho êm".
 */
export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

- `DomainRuleViolation`: lỗi nghiệp vụ dự kiến (đơn rỗng, đã mua rồi). Adapter bắt có chủ đích bằng `error instanceof DomainRuleViolation` rồi dịch ra HTTP 422 hoặc thông báo trên CLI.
- `InvalidArgumentError`: tham số sai kiểu hoặc giá trị (chủ yếu dữ liệu chưa qua validate). Đây là lỗi lập trình hoặc lỗi dữ liệu ở rìa, đừng nuốt nó để "cho êm"; ở HTTP nó thành 500 nếu lọt qua pipe.

Hai điểm riêng của TypeScript: (1) `instanceof` hoạt động với subclass của `Error` nhờ target ES2023; trên target quá cũ (ES5) thì không, vì hạn chế của việc biên dịch class kế thừa `Error`; (2) `catch (error)` có kiểu `unknown`, nên luôn phải kiểm `instanceof` trước khi đọc `error.message`, như trong controller và `demo.ts`.

## 7.8 Comparison: manual wiring with Fastify (or Express), no DI container

NestJS không phải điều kiện của kiến trúc này. Vì core chỉ là class và interface, ta ghép được bằng một framework HTTP tối giản, và **composition root là một file đọc từ trên xuống**. Lab có bản Fastify (file `lab/src/fastify/build-app.ts`): adapter HTTP nhận dependency qua tham số hàm, validate bằng JSON Schema có sẵn của Fastify, dịch `DomainRuleViolation` thành 422 trong `setErrorHandler`.

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { PlaceOrderUseCase } from '../application/port/in/place-order-use-case.js';
import type { OrderSummaryReader } from '../application/query/order-summary-reader.js';
import { DomainRuleViolation } from '../domain/shared/errors.js';

export interface Dependencies {
  readonly placeOrder: PlaceOrderUseCase;
  readonly reader: OrderSummaryReader;
}

const placeOrderSchema = {
  body: {
    type: 'object',
    required: ['ebookIds'],
    additionalProperties: false,
    properties: {
      ebookIds: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        uniqueItems: true,
        items: { type: 'string', minLength: 1, maxLength: 64 },
      },
    },
  },
} as const;

/**
 * Adapter HTTP viết tay: không có DI container, dependency đi vào qua tham số hàm.
 * Validate bằng JSON Schema có sẵn của Fastify.
 */
export function buildApp({ placeOrder, reader }: Dependencies): FastifyInstance {
  const app = Fastify();

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainRuleViolation) {
      return reply.status(422).send({ statusCode: 422, message: error.message });
    }
    return reply.send(error);
  });

  const customerOf = (header: string | string[] | undefined): string | undefined =>
    typeof header === 'string' && header.trim() !== '' ? header : undefined;

  app.get('/orders', async (request, reply) => {
    const customerId = customerOf(request.headers['x-customer-id']);
    if (customerId === undefined) return reply.status(401).send({ message: 'Thiếu danh tính khách.' });
    return reader.forCustomer(customerId);
  });

  app.post<{ Body: { ebookIds: string[] } }>('/orders', { schema: placeOrderSchema }, async (request, reply) => {
    const customerId = customerOf(request.headers['x-customer-id']);
    if (customerId === undefined) return reply.status(401).send({ message: 'Thiếu danh tính khách.' });
    const orderId = await placeOrder.handle({ customerId, ebookIds: request.body.ebookIds });
    return reply.status(201).send({ orderId });
  });

  return app;
}
```

Composition root (file `lab/src/fastify/main.ts`): không token, không decorator, không module; chỉ `new` theo thứ tự phụ thuộc.

```ts
import pg from 'pg';
import { SendOrderConfirmationWhenOrderPlaced } from '../application/listener/send-order-confirmation-when-order-placed.js';
import { PlaceOrderHandler } from '../application/place-order/place-order-handler.js';
import { EbookPurchasePolicy } from '../domain/order/ebook-purchase-policy.js';
import { OrderPlaced } from '../domain/order/order-events.js';
import { RecordingOrderNotifier } from '../infrastructure/in-memory/recording-order-notifier.js';
import { SynchronousEventPublisher } from '../infrastructure/in-memory/synchronous-event-publisher.js';
import { PgEbookCatalog } from '../infrastructure/postgres/pg-ebook-catalog.js';
import { PgOrderRepository } from '../infrastructure/postgres/pg-order-repository.js';
import { PgOrderSummaryReader } from '../infrastructure/postgres/pg-order-summary-reader.js';
import { SystemClock } from '../infrastructure/time/system-clock.js';
import { buildApp } from './build-app.js';

// Composition root viết tay: một file, đọc từ trên xuống là biết ai nối với ai.
const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
const orders = new PgOrderRepository(pool);
const notifier = new RecordingOrderNotifier(); // thay bằng adapter gửi thật
const events = new SynchronousEventPublisher();
const confirmation = new SendOrderConfirmationWhenOrderPlaced(notifier);
events.subscribe(OrderPlaced, (event) => confirmation.handle(event));

const placeOrder = new PlaceOrderHandler(
  orders,
  new PgEbookCatalog(pool),
  new EbookPurchasePolicy(orders),
  new SystemClock(),
  events,
);

const app = buildApp({ placeOrder, reader: new PgOrderSummaryReader(pool) });
await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: '0.0.0.0' });
```

Test (`lab/test/fastify.test.ts`) dùng `app.inject` của Fastify, tức gọi thẳng vào router mà không mở cổng mạng, và cùng core, cùng adapter in-memory với test NestJS.

| | NestJS | Fastify (hoặc Express) thủ công |
|---|---|---|
| Nối dependency | Module, provider, DI token, `useFactory` | `new` ở một file, truyền qua tham số |
| Validate đầu vào | DTO class + `ValidationPipe` | JSON Schema của Fastify (Express thì tự chọn thư viện) |
| Cấu trúc ứng dụng lớn | Có sẵn quy ước (module, guard, interceptor) | Tự đặt quy ước |
| Lượng "ma thuật" | Nhiều (decorator, metadata lúc chạy) | Gần như không |
| Chi phí khi thêm port | Thêm token và provider | Thêm tham số và dòng `new` |
| Hợp với | Đội lớn, nhiều module, cần quy ước thống nhất | Dịch vụ nhỏ, ít dependency, muốn thấy rõ mọi thứ |

Express 5 ghép theo đúng cách của Fastify (hàm dựng app nhận dependency, `app.post('/orders', ...)` gọi `placeOrder.handle(...)`); sách chỉ chạy bản Fastify và không chạy bản Express. Điểm cần rút ra: **core không đổi một dòng** giữa NestJS và Fastify (cả hai test đều import đúng các file trong `src/domain` và `src/application`). Đó là phần thưởng của việc tách core.

## 7.9 Swapping frameworks: an honest account

Core TypeScript thuần dùng lại được giữa NestJS, Fastify, Express, hay một worker không có HTTP, bằng cách viết lại phần adapter và composition root. Đổi sang **ngôn ngữ khác** (Go, Java) thì phải viết lại core: cái ta giữ được là mô hình, luật, và test dạng đặc tả. Cũng lưu ý: dùng lại core giữa framework chỉ đúng khi core thật sự không import framework; chỉ cần một `@Injectable()` lọt vào `src/application` là bạn đã buộc core vào NestJS.

## 7.10 Common pitfalls

- **Gắn `@Injectable()` hoặc `@Inject()` vào handler/domain** vì tiện: phá boundary của chương 1. Dùng `useFactory` ở module.
- **Quên `.js` ở `import` tương đối** trong dự án ESM: `tsc` báo lỗi với `module: NodeNext`; nếu chạy file đã biên dịch từ nơi khác còn gặp `ERR_MODULE_NOT_FOUND`.
- **Dùng `interface` làm kiểu `@Body()`**: không có metadata lúc chạy nên `ValidationPipe` không kiểm gì. DTO phải là class.
- **Quên `ValidationPipe` toàn cục**: DTO chỉ là chú thích, không có gì kiểm tra. Đặt trong `configureApp` để production và test dùng chung.
- **Token sai kiểu**: `@Inject(CLOCK)` nhưng khai báo tham số là `OrderRepository`; compiler không bắt. Test e2e mới bắt.
- **Scope request/transient cho repository in-memory** rồi thắc mắc vì sao dữ liệu "mất".
- **`@OnEvent` nuốt lỗi mặc định**: listener ném lỗi chỉ bị log, `emitAsync` vẫn thành công. Đặt `suppressErrors: false` nếu muốn lỗi truyền ngược (chương 8).
- **Không đóng connection pool**: process test hoặc process tắt mềm không thoát. Dùng `OnModuleDestroy`.
- **Cho domain import `@nestjs/*`** (ví dụ `Logger`, `HttpException`) vì tiện.
- **Validate trong handler thay vì ở rìa.** Hình dạng dữ liệu là việc của rìa; handler chỉ đổi sang ID branded.

## 7.11 Summary

1. NestJS 12: package ESM, cần Node.js 20.19 hoặc 22.12 trở lên, vẫn dùng `experimentalDecorators` và `emitDecoratorMetadata`; lab dùng TypeScript 7.0.2 và Node.js 26.
2. Composition root là module: DI token (`Symbol`) cho từng port, `useFactory` để dựng handler của core không decorator.
3. Provider mặc định là singleton; test thay adapter bằng `overrideProvider(token).useValue(...)`.
4. DTO class + `ValidationPipe` cho hình dạng dữ liệu, core cho luật; kiểu của TypeScript không tồn tại lúc chạy nên dữ liệu ngoài phải được validate ở rìa.
5. Ghép thủ công bằng Fastify (hoặc Express) cũng được, không cần DI container; core không đổi dòng nào giữa hai cách.

## 7.12 Self-check

1. Vì sao NestJS cần DI token (`Symbol`) mà không inject thẳng theo kiểu interface?
2. Vì sao handler của core được dựng bằng `useFactory` thay vì gắn `@Injectable()`?
3. `@Body() body: PlaceOrderDto` với `PlaceOrderDto` là `interface` thì chuyện gì xảy ra?
4. Provider mặc định có scope gì, và vì sao điều đó quan trọng với repository in-memory trong test?
5. Hai ưu điểm và hai nhược điểm của ghép thủ công bằng Fastify so với NestJS?

<details>
<summary>Answer</summary>

1. Interface của TypeScript bị xoá lúc biên dịch, lúc chạy không còn gì để tra container; cần một giá trị (Symbol hoặc abstract class) làm khoá.
2. Để core không import decorator của NestJS; module (ở infrastructure) làm việc nối dây.
3. Interface không có metadata lúc chạy, `ValidationPipe` không kiểm gì và body lọt thẳng vào controller. DTO phải là class có decorator của `class-validator`.
4. Singleton: một instance dùng chung. Nhờ vậy handler, policy và test cùng thấy dữ liệu đã lưu; scope transient/request sẽ cho mỗi nơi một repository riêng.
5. Ưu: ít "ma thuật" và ít dependency, composition root đọc một mạch. Nhược: tự đặt quy ước cấu trúc cho dự án lớn, tự chọn và nối thư viện validate/guard/logging thay vì có sẵn.

</details>
