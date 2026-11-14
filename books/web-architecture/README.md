# Kiến trúc ứng dụng web: bản học lại (TypeScript 7, Node.js 26 và NestJS 12)

Đây là bản tự học viết lại bằng lời mới cho chủ đề của ebook "Kiến trúc ứng dụng web": tách core code khỏi infrastructure code, Domain Model, Repository, Read Model, Application Service, Layered Architecture, Ports & Adapters. Nội dung đã được cập nhật theo thực tế tháng 11/2026 và mọi ví dụ TypeScript đều bám vào **một** hệ thống code duy nhất trong thư mục `lab/`.

## Phiên bản đã dùng

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | **26 (LTS)** (image `node:26`, thực tế v26.13.0) | `crypto.randomUUID()`, `fetch`, `node:test`, top-level `await` (ESM) |
| TypeScript | **7.0.2** (trình biên dịch native) | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `NodeNext`; kiểm tra bằng `tsc --noEmit` |
| NestJS | **12.4.0** (`@nestjs/core`, `common`, `platform-express`, `testing`), `@nestjs/event-emitter` 12.0.2 | Package ESM, cần Node.js 20.19 hoặc 22.12 trở lên; DTO bằng `class-validator` 0.15.1 và `class-transformer` 0.5.1 |
| PostgreSQL | **18.6** (image `postgres:18`) và driver `pg` 8.23.1 | Adapter persistence viết bằng `pg` thuần, lý do ở chương 3 |
| Fastify | 5.12.8 | Chỉ dùng cho mục so sánh ghép thủ công ở chương 7 |
| Test | `node:test` + `node:assert/strict` | Không thêm thư viện test; `@nestjs/testing` chỉ để dựng module |
| Docker | Mọi lệnh Node.js và PostgreSQL đều chạy trong container, không cài gì lên máy | |

Core (`src/domain`, `src/application`) không phụ thuộc package nào: chỉ import lẫn nhau, không import `@nestjs`, `pg` hay infrastructure. Kiểm chứng: `grep -rE "@nestjs|from .pg.|infrastructure" src/domain src/application` không in ra dòng nào.

## Ví dụ xuyên suốt: đặt mua e-book

Khách (`CustomerId`) đặt một **đơn hàng** (`Order`, aggregate root) gồm các `OrderLine` (value object, chụp tên và giá lúc đặt, tham chiếu sách bằng `EbookId`). Có hai use case ghi (`PlaceOrder`, `PayOrder`) và một truy vấn đọc (`OrderSummaryReader.forCustomer`). Luật: đơn không rỗng, không trùng sách, không cộng khác tiền tệ, đơn đã trả không huỷ, không mua lại sách đã trả tiền.

Tên class và method signature là cố định trong mọi chương:

| Layer | Class chính |
|---|---|
| Domain | `Order`, `OrderLine`, `OrderStatus`, `OrderId`, `CustomerId`, `EbookId` (branded type), `Money`, `Ebook`, `OrderRepository`, `EbookCatalog`, `EbookPurchasePolicy`, `OrderPlaced`, `OrderPaid` |
| Application | `PlaceOrderCommand`, `PlaceOrderHandler`, `PayOrderCommand`, `PayOrderHandler`, `PlaceOrderUseCase`, `PayOrderUseCase`, `Clock`, `EventPublisher`, `OrderNotifier`, `OrderSummary`, `OrderSummaryReader`, `SendOrderConfirmationWhenOrderPlaced` |
| Infrastructure | `InMemory*`, `SystemClock`, `FixedClock`, `SynchronousEventPublisher`, `RecordingOrderNotifier`; phía PostgreSQL: `PgOrderRepository`, `PgEbookCatalog`, `PgOrderSummaryReader`; phía NestJS: `BookshopModule`, `OrderController`, `PlaceOrderDto`, `NestEventPublisher`, `OrderConfirmationSubscriber`, `LogOrderNotifier` |

## Mục lục

1. [Tách core code khỏi infrastructure code](01-separating-core-and-infrastructure.md)
2. [Domain Model: Entity, Value Object, Aggregate](02-domain-model-entity-value-object.md)
3. [Repository](03-repository.md)
4. [Application Service, Command, Domain Service, Read Model](04-application-service-command-read-model.md)
5. [Layered Architecture](05-layered-architecture.md)
6. [Ports & Adapters](06-ports-and-adapters.md)
7. [Ghép core vào NestJS 12 (và so sánh với Fastify thủ công)](07-integrating-core-with-nestjs.md)
8. [Domain Event và testing theo từng layer](08-domain-events-and-testing.md)

## Cách đọc

- Mỗi chương theo khuôn: vấn đề, giải pháp, code, cạm bẫy, tóm tắt 3-5 ý, câu hỏi tự kiểm tra (đáp án nằm trong thẻ `<details>` ở cuối).
- Code trong các chương được **chèn trực tiếp từ file trong `lab/`**, nên giống hệt code đã chạy thử. Đoạn nào là "minh hoạ xấu" đều được ghi rõ và không nằm trong `lab/`. Đoạn trích một phần file ghi rõ file nguồn và số dòng.
- Thứ tự gợi ý: 1 đến 8. Muốn nhanh: đọc 1, 2, 6, rồi chạy `npm run demo`.
- Nơi nào một class "tiến hoá" qua các chương (ví dụ `OrderRepository` ban đầu 3 method, thêm `customerHasPaidFor` ở chương 4), sách ghi rõ và trình bày bản cuối cho khớp với `lab/`.
- Tên file của chương 7 vẫn là `07-integrating-core-with-nestjs.md` (giữ nguyên để không vỡ link); nội dung đã viết lại cho NestJS.

## Chạy lại code

Lệnh chạy từ thư mục `web-architecture/`. `node_modules` đặt trong một Docker volume để không làm bẩn thư mục `lab/`:

```bash
# Cài dependency một lần (volume bookshop-nm giữ node_modules)
docker volume create bookshop-nm
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm ci

# Kiểm tra kiểu (strict) mà không sinh file
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run typecheck

# Biên dịch ra lab/dist
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run build

# Chạy use case đặt mua e-book bằng adapter InMemory (không NestJS, không database)
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run demo

# Chạy bộ test (42 test; các test PostgreSQL tự bỏ qua khi không có DATABASE_URL)
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm test
```

Chạy thêm các test PostgreSQL (adapter, contract test, module NestJS thật), tổng cộng 51 test:

```bash
docker network create bookshop-net
docker run -d --name bookshop-pg --network bookshop-net -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=bookshop postgres:18

# đợi vài giây cho PostgreSQL khởi động xong, rồi:
docker run --rm --network bookshop-net -e DATABASE_URL=postgres://postgres:pw@bookshop-pg:5432/bookshop \
  -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm test

# dọn dẹp
docker rm -f bookshop-pg
docker network rm bookshop-net
docker volume rm bookshop-nm
```

Chạy server NestJS (cần PostgreSQL đã có schema `lab/db/schema.sql` và dữ liệu e-book), map cổng 3000 ra máy: thêm `-p 3000:3000 -e DATABASE_URL=...` và dùng `npm start` sau `npm run build`. Ví dụ gọi: `curl -X POST localhost:3000/orders -H 'content-type: application/json' -H 'x-customer-id: cus-1' -d '{"ebookIds":["ddd-101"]}'`.

Trên Git Bash của Windows, thêm `MSYS_NO_PATHCONV=1` trước `docker` và dùng đường dẫn tuyệt đối dạng `C:/...` cho `-v`.

## Cấu trúc `lab/`

```text
lab/
  package.json, tsconfig.json, package-lock.json
  db/schema.sql                  # schema PostgreSQL
  src/domain/...                 # core, không phụ thuộc package nào
  src/application/...            # core, chỉ phụ thuộc Domain và port
  src/infrastructure/in-memory/  # adapter thuần TypeScript (InMemory, event đồng bộ)
  src/infrastructure/time/       # SystemClock, FixedClock
  src/infrastructure/postgres/   # adapter PostgreSQL (driver pg)
  src/nest/                      # NestJS: module, controller, DTO, token, event adapter
  src/fastify/                   # ghép thủ công bằng Fastify (mục so sánh chương 7)
  script/demo.ts                 # adapter kiểu CLI
  test/                          # node:test: domain, application, typing, contract, nest, fastify, postgres
```

## Nguồn khái niệm

- Eric Evans, *Domain-Driven Design* (2003): Entity, Value Object, Aggregate, Repository, Domain Service.
- Vaughn Vernon, *Implementing Domain-Driven Design* (2013): quy tắc thiết kế Aggregate, repository collection-oriented và persistence-oriented, Domain Event.
- Martin Fowler, *Patterns of Enterprise Application Architecture* (2002): định nghĩa Repository.
- Alistair Cockburn, *Hexagonal Architecture* (2005).
- Jeffrey Palermo, *Onion Architecture* (2008).
- Robert C. Martin, *The Clean Architecture* (2012) và sách *Clean Architecture* (2017).
- Bertrand Meyer, CQS (*Object-Oriented Software Construction*); GoF, *Design Patterns* (1994) cho Command pattern.
- Tài liệu NestJS 12: docs.nestjs.com (migration guide, providers, pipes/validation, testing, event emitter); tài liệu Node.js, TypeScript, node-postgres, Fastify.
