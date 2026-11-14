# Testing cho layered architecture và Hexagonal

Bản học dành cho developer TypeScript/Node.js đã biết layered architecture, Ports & Adapters, DDD cơ bản và Spec-Driven Development (acceptance criteria dạng Given/When/Then), và giờ muốn **viết test tốt**: test bảo vệ được hành vi, sống sót qua refactor, chạy nhanh, và có traceability về yêu cầu.

Điểm xuyên suốt: mỗi layer của kiến trúc có một loại test "hợp" với nó. Domain thì unit test thuần. Use case thì dùng fake adapter. Adapter thì integration test với infrastructure thật. HTTP boundary thì test qua `app.inject`/Supertest. Yêu cầu nghiệp vụ thì acceptance test gắn mã AC. Sau cùng là các kỹ thuật bổ trợ: contract (Pact), characterization, mutation, property-based, E2E.

## Ai nên đọc, cần biết gì

- Đã đọc/làm quen: layered architecture, Hexagonal (port/adapter), entity/value object/aggregate, Given/When/Then.
- Biết TypeScript và `async/await` ở mức viết được một test đơn giản với Vitest hoặc Jest.
- Không cần biết trước Docker; lab chỉ cần Docker.

## Mục lục

1. [Test để làm gì và thế nào là một test tốt](01-why-test-and-good-tests.md)
2. [Hình dạng bộ test: pyramid, trophy, honeycomb; classical và London](02-test-suite-shapes.md)
3. [Unit test cho domain: output, state, communication](03-unit-test-domain.md)
4. [Test double và ranh giới mock](04-test-doubles.md)
5. [Test use case bằng fake adapter](05-testing-use-cases-with-fakes.md)
6. [Integration test cho adapter với PostgreSQL thật](06-integration-test-adapter-db.md)
7. [Test HTTP/handler trong Node.js (Fastify, Supertest) và test cấu hình](07-http-tests-nodejs.md)
8. [Acceptance test và traceability từ AC tới test](08-acceptance-tests-and-traceability.md)
9. [Contract test (Pact JS) và schema test](09-contract-test.md)
10. [Characterization test, snapshot và approval test cho legacy](10-characterization-tests-legacy.md)
11. [Mutation testing (StrykerJS) và property-based testing (fast-check)](11-mutation-and-property-based-testing.md)
12. [E2E (Playwright Test), flaky test, test data và CI](12-e2e-flaky-tests-test-data-ci.md)

## Phiên bản đã dùng (kiểm tra 11/2026)

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 26.13.0 (image `node:26`, cũng là tag `node:lts` ở thời điểm viết) | chạy TypeScript trực tiếp (`node src/server.ts`) nhờ type stripping |
| npm | 11.20.0 | đi kèm image |
| TypeScript | **6.0.3** trong lab; 7.0.2 là bản mới nhất | `tsc --noEmit` của 7.0.2 chạy sạch trên lab, nhưng StrykerJS 10.1.1 chưa chạy được với TS 7 (thiếu API compiler cũ), nên lab ghim 6.0.3 |
| Vitest | 5.1.0 | test runner chính (đã cân nhắc `node:test`, xem bên dưới) |
| fast-check | 4.10.2 | property-based testing |
| StrykerJS | `@stryker-mutator/core`, `vitest-runner`, `typescript-checker` 10.1.1 | mutation testing |
| Fastify | 5.12.8 | HTTP handler của lab (`app.inject`) |
| Supertest | 7.3.2 (+ `@types/supertest` 7.2.1) | test HTTP qua `http.Server` thật |
| pg (node-postgres) | 8.23.1 (+ `@types/pg` 8.23.1) | adapter PostgreSQL |
| PostgreSQL | 18 (image `postgres:18-alpine`) | |
| Pact JS | `@pact-foundation/pact` 17.1.4 | consumer + provider verification, đã chạy |
| Playwright | `@playwright/test` 1.65.0, image `mcr.microsoft.com/playwright:v1.65.0-noble` | E2E, đã chạy |
| Testcontainers for Node | 12.2.1 (`testcontainers`, `@testcontainers/postgresql`) | chỉ tra cứu, lab không dùng (chương 6 giải thích trade-off) |
| NestJS testing | `@nestjs/testing` 12.4.0 | chỉ tra cứu, chưa chạy (chương 7) |
| Express | 5.3.0 | chỉ tra cứu; Supertest dùng cùng cách |

**Vì sao Vitest mà không phải `node:test`.** `node:test` (có sẵn trong Node, không cần dependency) hoàn toàn đủ cho unit test và đúng tinh thần "ít dependency". Lab chọn Vitest vì ba thứ cần trong sách: runner chính thức của StrykerJS (`vitest-runner` tận dụng `coverageAnalysis: perTest`), `toMatchFileSnapshot` cho approval test (chương 10) và `vi.fn()` có kiểu (chương 4). Nếu bạn chỉ cần unit test và không dùng Stryker, hãy cân nhắc `node:test`.

## Cách chạy lab

Lab nằm ở [`lab/`](lab/), chạy hoàn toàn trong Docker (không cài gì lên máy, kể cả Node). Mọi tài nguyên có tiền tố `bookcheck-testts-`; không map port ra host.

```bash
cd lab
./run.sh up          # tạo network, volume node_modules, container PostgreSQL 18 (giới hạn 256 MB)
./run.sh install     # npm ci (BÊN TRONG container node:26)
./run.sh typecheck   # tsc --noEmit
./run.sh unit        # unit test domain (gồm property test fast-check)
./run.sh app         # test use case với fake
./run.sh accept      # acceptance test (mã AC-ORD-*)
./run.sh http        # test HTTP: app.inject, Supertest, composition root
./run.sh integ       # integration test với PostgreSQL thật
./run.sh charact     # characterization + snapshot
./run.sh contract    # schema test + Pact consumer/provider
./run.sh all         # toàn bộ test Vitest
./run.sh mutation    # StrykerJS (vài phút đến cỡ 10 phút)
./run.sh trace       # bảng traceability AC <-> test, hai chiều
./run.sh e2e         # Playwright, trong image mcr.microsoft.com/playwright (kéo image khoảng vài GB lần đầu)
./run.sh down        # xóa container, network, volume, thư mục sinh ra
```

Trên Windows dùng Git Bash (script đã đặt `MSYS_NO_PATHCONV=1`). Các container tự giới hạn `--memory`. Muốn chạy một lệnh bất kỳ trong container: `./run.sh exec npx vitest run -t AC-ORD-5`.

## Kết quả chạy thực tế (ghi lại từ lab)

```
typecheck        tsc --noEmit sạch (TypeScript 6.0.3; bản 7.0.2 cũng sạch khi thử lúc đầu)
unit             29 tests (Order 14, Money 10, property fast-check 3, error types 2)
application      6 tests
acceptance       6 tests (AC-ORD-1..6)
characterization 9 tests (8 ca ShippingFee + 1 snapshot)
contract         4 tests (schema 2 + Pact consumer/provider 2)
http             13 tests (app.inject 8, Supertest 2, composition root 3)
integration      7 tests   # PostgreSQL 18 thật
all              14 files, 74 tests, Vitest 5.1.0, ~11 giây (4 giây khi máy rảnh)
trace            6/6 AC có test, 6/6 test trỏ về AC; thêm AC giả -> exit 1
stryker vòng 1   140 mutant: 41 CompileError, 99 chạy: 82 killed, 14 survived, 3 no coverage; MSI 82,83% (covered 85,42%)
stryker vòng 2   140 mutant: 41 CompileError, 99 chạy: 99 killed; MSI 100% (12 phút 43 giây)
e2e (Playwright) 2 passed (15,1 giây) trong image mcr.microsoft.com/playwright:v1.65.0-noble
```

Ba điểm đáng nhớ từ lần chạy thật (chi tiết ở chương tương ứng): fake giữ reference che lỗi quên `save()` (chương 5), Ajv của Fastify ép kiểu `"2"` thành `2` (chương 7), và StrykerJS 10.1.1 không chạy được với TypeScript 7 nên lab ghim TypeScript 6.0.3 (chương 11).

Chi tiết và cách đọc kết quả ở chương 11 (mutation) và chương 12 (E2E).

## Đọc thêm (sách và tài liệu có thật)

- Vladimir Khorikov, *Unit Testing: Principles, Practices, and Patterns* (Manning, 2020).
- Steve Freeman, Nat Pryce, *Growing Object-Oriented Software, Guided by Tests* (Addison-Wesley, 2009).
- Michael Feathers, *Working Effectively with Legacy Code* (Prentice Hall, 2004).
- Martin Fowler, "Mocks Aren't Stubs" (martinfowler.com/articles/mocksArentStubs.html) và "TestPyramid", "Practical Test Pyramid" (Ham Vocke, martinfowler.com).
- Tài liệu chính thức: [Vitest](https://vitest.dev), [node:test](https://nodejs.org/api/test.html), [StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/), [fast-check](https://fast-check.dev), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Supertest](https://github.com/ladjs/supertest), [Pact](https://docs.pact.io), [Playwright](https://playwright.dev/docs/intro), [Testcontainers for Node](https://node.testcontainers.org).

## Quy ước

Mọi đoạn code TypeScript xuất hiện trong sách đều lấy từ `lab/` (cùng tên file, cùng chữ ký) và đã chạy xanh, trừ các mục ghi rõ "chưa chạy thử" hoặc "minh họa" (Testcontainers, NestJS, workflow GitHub Actions, Pact Broker). Thông điệp lỗi trong code lab viết không dấu để tránh vấn đề encoding.
