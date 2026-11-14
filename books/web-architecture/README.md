# Web Application Architecture

This is a self-study edition rewritten in new wording for the topic of the ebook "Web Application Architecture": separating core code from infrastructure code, Domain Model, Repository, Read Model, Application Service, Layered Architecture, Ports & Adapters. The content has been updated to the state of things in November 2026 (TypeScript 7, Node.js 26, and NestJS 12), and every TypeScript example follows **one** single codebase in the `lab/` folder. The lecture text of the chapters is written in Vietnamese.

## Versions used

| Component | Version | Notes |
|---|---|---|
| Node.js | **26 (LTS)** (image `node:26`, actually v26.13.0) | `crypto.randomUUID()`, `fetch`, `node:test`, top-level `await` (ESM) |
| TypeScript | **7.0.2** (native compiler) | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `NodeNext`; checked with `tsc --noEmit` |
| NestJS | **12.4.0** (`@nestjs/core`, `common`, `platform-express`, `testing`), `@nestjs/event-emitter` 12.0.2 | ESM packages, require Node.js 20.19 or 22.12 and above; DTOs with `class-validator` 0.15.1 and `class-transformer` 0.5.1 |
| PostgreSQL | **18.6** (image `postgres:18`) and the `pg` 8.23.1 driver | The persistence adapter is written with plain `pg`, reason in chapter 3 |
| Fastify | 5.12.8 | Used only in the manual-wiring comparison in chapter 7 |
| Test | `node:test` + `node:assert/strict` | No extra test library; `@nestjs/testing` is used only to build modules |
| Docker | Every Node.js and PostgreSQL command runs in a container, nothing is installed on the machine | |

The core (`src/domain`, `src/application`) depends on no package: the two only import each other, never `@nestjs`, `pg`, or infrastructure. Verification: `grep -rE "@nestjs|from .pg.|infrastructure" src/domain src/application` prints nothing.

## Running example: ordering an e-book

A customer (`CustomerId`) places an **order** (`Order`, the aggregate root) made up of `OrderLine`s (value objects that snapshot the name and price at order time and reference the book by `EbookId`). There are two write use cases (`PlaceOrder`, `PayOrder`) and one read query (`OrderSummaryReader.forCustomer`). Rules: an order is non-empty, has no duplicate books, never adds different currencies together, a paid order cannot be cancelled, and a book that has already been paid for cannot be bought again.

Class names and method signatures are fixed across all chapters:

| Layer | Main classes |
|---|---|
| Domain | `Order`, `OrderLine`, `OrderStatus`, `OrderId`, `CustomerId`, `EbookId` (branded type), `Money`, `Ebook`, `OrderRepository`, `EbookCatalog`, `EbookPurchasePolicy`, `OrderPlaced`, `OrderPaid` |
| Application | `PlaceOrderCommand`, `PlaceOrderHandler`, `PayOrderCommand`, `PayOrderHandler`, `PlaceOrderUseCase`, `PayOrderUseCase`, `Clock`, `EventPublisher`, `OrderNotifier`, `OrderSummary`, `OrderSummaryReader`, `SendOrderConfirmationWhenOrderPlaced` |
| Infrastructure | `InMemory*`, `SystemClock`, `FixedClock`, `SynchronousEventPublisher`, `RecordingOrderNotifier`; PostgreSQL side: `PgOrderRepository`, `PgEbookCatalog`, `PgOrderSummaryReader`; NestJS side: `BookshopModule`, `OrderController`, `PlaceOrderDto`, `NestEventPublisher`, `OrderConfirmationSubscriber`, `LogOrderNotifier` |

## Contents

1. [Separating Core Code from Infrastructure Code](01-separating-core-and-infrastructure.md)
2. [Domain Model: Entity, Value Object and Aggregate](02-domain-model-entity-value-object.md)
3. [Repository](03-repository.md)
4. [Application Service, Command, Domain Service and Read Model](04-application-service-command-read-model.md)
5. [Layered Architecture](05-layered-architecture.md)
6. [Ports & Adapters (Hexagonal Architecture)](06-ports-and-adapters.md)
7. [Integrating the Core with NestJS 12 (and comparing with manual Fastify wiring)](07-integrating-core-with-nestjs.md)
8. [Domain Events and Testing per Layer](08-domain-events-and-testing.md)

## How to read

- Each chapter follows the same mold: the problem, the solution, code, pitfalls, a 3-5 point summary, and self-check questions (answers are in a `<details>` block at the end).
- The code in the chapters is **inserted directly from files in `lab/`**, so it is identical to the code that was run. Any "bad illustration" is clearly marked and is not in `lab/`. Excerpts of part of a file state the source file and line numbers.
- Suggested order: 1 to 8. For a quick path: read 1, 2, 6, then run `npm run demo`.
- Where a class "evolves" across chapters (for example `OrderRepository` starts with 3 methods and gains `customerHasPaidFor` in chapter 4), the book says so explicitly and presents the final version so that it matches `lab/`.
- The file name of chapter 7 is still `07-integrating-core-with-nestjs.md` (kept as is so links don't break); the content has been rewritten for NestJS.

## Re-running the code

Commands are run from the `web-architecture/` folder. `node_modules` lives in a Docker volume so the `lab/` folder stays clean:

```bash
# Install dependencies once (the bookshop-nm volume holds node_modules)
docker volume create bookshop-nm
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm ci

# Type-check (strict) without emitting files
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run typecheck

# Compile to lab/dist
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run build

# Run the e-book ordering use case with InMemory adapters (no NestJS, no database)
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm run demo

# Run the test suite (42 tests; the PostgreSQL tests skip themselves when DATABASE_URL is absent)
docker run --rm -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm test
```

To also run the PostgreSQL tests (adapter, contract tests, the real NestJS module), 51 tests in total:

```bash
docker network create bookshop-net
docker run -d --name bookshop-pg --network bookshop-net -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=bookshop postgres:18

# wait a few seconds for PostgreSQL to finish starting, then:
docker run --rm --network bookshop-net -e DATABASE_URL=postgres://postgres:pw@bookshop-pg:5432/bookshop \
  -v "$PWD/lab:/app" -v bookshop-nm:/app/node_modules -w /app node:26 npm test

# clean up
docker rm -f bookshop-pg
docker network rm bookshop-net
docker volume rm bookshop-nm
```

To run the NestJS server (needs a PostgreSQL that already has the `lab/db/schema.sql` schema and e-book data), map port 3000 out to the machine: add `-p 3000:3000 -e DATABASE_URL=...` and use `npm start` after `npm run build`. Example call: `curl -X POST localhost:3000/orders -H 'content-type: application/json' -H 'x-customer-id: cus-1' -d '{"ebookIds":["ddd-101"]}'`.

On Git Bash for Windows, add `MSYS_NO_PATHCONV=1` before `docker` and use absolute paths of the form `C:/...` for `-v`.

## Structure of `lab/`

```text
lab/
  package.json, tsconfig.json, package-lock.json
  db/schema.sql                  # PostgreSQL schema
  src/domain/...                 # core, depends on no package
  src/application/...            # core, depends only on Domain and ports
  src/infrastructure/in-memory/  # plain TypeScript adapters (InMemory, synchronous events)
  src/infrastructure/time/       # SystemClock, FixedClock
  src/infrastructure/postgres/   # PostgreSQL adapter (pg driver)
  src/nest/                      # NestJS: module, controller, DTO, token, event adapter
  src/fastify/                   # manual wiring with Fastify (chapter 7 comparison)
  script/demo.ts                 # CLI-style adapter
  test/                          # node:test: domain, application, typing, contract, nest, fastify, postgres
```

## Sources of the concepts

- Eric Evans, *Domain-Driven Design* (2003): Entity, Value Object, Aggregate, Repository, Domain Service.
- Vaughn Vernon, *Implementing Domain-Driven Design* (2013): Aggregate design rules, collection-oriented and persistence-oriented repositories, Domain Event.
- Martin Fowler, *Patterns of Enterprise Application Architecture* (2002): the definition of Repository.
- Alistair Cockburn, *Hexagonal Architecture* (2005).
- Jeffrey Palermo, *Onion Architecture* (2008).
- Robert C. Martin, *The Clean Architecture* (2012) and the book *Clean Architecture* (2017).
- Bertrand Meyer, CQS (*Object-Oriented Software Construction*); GoF, *Design Patterns* (1994) for the Command pattern.
- NestJS 12 documentation: docs.nestjs.com (migration guide, providers, pipes/validation, testing, event emitter); documentation for Node.js, TypeScript, node-postgres, Fastify.
