# Testing Layered & Hexagonal Architectures

A study edition for TypeScript/Node.js developers who already know layered architecture, Ports & Adapters, basic DDD and Spec-Driven Development (acceptance criteria in Given/When/Then form), and who now want to **write good tests**: tests that protect behavior, survive refactoring, run fast, and trace back to requirements.

The thread running through the book: each architectural layer has a kind of test that suits it. The domain gets pure unit tests. Use cases use fake adapters. Adapters get integration tests against real infrastructure. The HTTP boundary is tested through `app.inject`/Supertest. Business requirements get acceptance tests tagged with AC IDs. Finally come the supporting techniques: contract (Pact), characterization, mutation, property-based, and E2E.

## Who this book is for and prerequisites

- You have read or are familiar with: layered architecture, Hexagonal (port/adapter), entity/value object/aggregate, Given/When/Then.
- You know TypeScript and `async/await` well enough to write a simple test with Vitest or Jest.
- No prior Docker knowledge is needed; the lab only requires Docker.

## Contents

1. [Chapter 1. Why we test and what makes a good test](01-why-test-and-good-tests.md)
2. [Chapter 2. Test suite shapes: pyramid, trophy, honeycomb; classical and London](02-test-suite-shapes.md)
3. [Chapter 3. Unit tests for the domain: output, state, communication](03-unit-test-domain.md)
4. [Chapter 4. Test doubles and the mocking boundary](04-test-doubles.md)
5. [Chapter 5. Testing use cases with fake adapters](05-testing-use-cases-with-fakes.md)
6. [Chapter 6. Integration tests for adapters with a real PostgreSQL](06-integration-test-adapter-db.md)
7. [Chapter 7. Testing HTTP handlers in Node.js (Fastify, Supertest) and configuration tests](07-http-tests-nodejs.md)
8. [Chapter 8. Acceptance tests and traceability from acceptance criteria to tests](08-acceptance-tests-and-traceability.md)
9. [Chapter 9. Contract tests between services (Pact JS) and schema tests](09-contract-test.md)
10. [Chapter 10. Characterization, snapshot, and approval tests for legacy code](10-characterization-tests-legacy.md)
11. [Chapter 11. Mutation testing (StrykerJS) and property-based testing (fast-check)](11-mutation-and-property-based-testing.md)
12. [Chapter 12. E2E (Playwright Test), flaky tests, test data, and CI](12-e2e-flaky-tests-test-data-ci.md)

## Versions used (checked 11/2026)

| Component | Version | Notes |
|---|---|---|
| Node.js | 26.13.0 (image `node:26`, also the `node:lts` tag at the time of writing) | runs TypeScript directly (`node src/server.ts`) thanks to type stripping |
| npm | 11.20.0 | bundled with the image |
| TypeScript | **6.0.3** in the lab; 7.0.2 is the latest | `tsc --noEmit` from 7.0.2 runs clean on the lab, but StrykerJS 10.1.1 cannot run with TS 7 (missing old compiler API), so the lab pins 6.0.3 |
| Vitest | 5.1.0 | main test runner (`node:test` was considered, see below) |
| fast-check | 4.10.2 | property-based testing |
| StrykerJS | `@stryker-mutator/core`, `vitest-runner`, `typescript-checker` 10.1.1 | mutation testing |
| Fastify | 5.12.8 | the lab's HTTP handler (`app.inject`) |
| Supertest | 7.3.2 (+ `@types/supertest` 7.2.1) | HTTP tests through a real `http.Server` |
| pg (node-postgres) | 8.23.1 (+ `@types/pg` 8.23.1) | PostgreSQL adapter |
| PostgreSQL | 18 (image `postgres:18-alpine`) | |
| Pact JS | `@pact-foundation/pact` 17.1.4 | consumer + provider verification, run |
| Playwright | `@playwright/test` 1.65.0, image `mcr.microsoft.com/playwright:v1.65.0-noble` | E2E, run |
| Testcontainers for Node | 12.2.1 (`testcontainers`, `@testcontainers/postgresql`) | looked up only, not used by the lab (chapter 6 explains the trade-off) |
| NestJS testing | `@nestjs/testing` 12.4.0 | looked up only, not run (chapter 7) |
| Express | 5.3.0 | looked up only; Supertest works the same way |

**Why Vitest and not `node:test`.** `node:test` (built into Node, no dependency needed) is perfectly adequate for unit tests and fits the "few dependencies" spirit. The lab picks Vitest for three things the book needs: it is StrykerJS's official runner (`vitest-runner` takes advantage of `coverageAnalysis: perTest`), `toMatchFileSnapshot` for approval tests (chapter 10), and typed `vi.fn()` (chapter 4). If you only need unit tests and do not use Stryker, consider `node:test`.

## Running the labs

The lab is in [`lab/`](lab/) and runs entirely in Docker (nothing is installed on your machine, not even Node). All resources are prefixed `bookcheck-testts-`; no ports are mapped to the host.

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

On Windows use Git Bash (the script already sets `MSYS_NO_PATHCONV=1`). The containers limit themselves with `--memory`. To run any command inside the container: `./run.sh exec npx vitest run -t AC-ORD-5`.

## Actual run results (recorded from the lab)

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

Three points worth remembering from the real runs (details in the corresponding chapters): a reference-holding fake hides a forgotten `save()` (chapter 5), Fastify's Ajv coerces the string `"2"` into the number `2` (chapter 7), and StrykerJS 10.1.1 cannot run with TypeScript 7, so the lab pins TypeScript 6.0.3 (chapter 11).

Details and how to read the results are in chapter 11 (mutation) and chapter 12 (E2E).

## Further reading (real books and documentation)

- Vladimir Khorikov, *Unit Testing: Principles, Practices, and Patterns* (Manning, 2020).
- Steve Freeman, Nat Pryce, *Growing Object-Oriented Software, Guided by Tests* (Addison-Wesley, 2009).
- Michael Feathers, *Working Effectively with Legacy Code* (Prentice Hall, 2004).
- Martin Fowler, "Mocks Aren't Stubs" (martinfowler.com/articles/mocksArentStubs.html), "TestPyramid", and "Practical Test Pyramid" (Ham Vocke, martinfowler.com).
- Official documentation: [Vitest](https://vitest.dev), [node:test](https://nodejs.org/api/test.html), [StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/), [fast-check](https://fast-check.dev), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Supertest](https://github.com/ladjs/supertest), [Pact](https://docs.pact.io), [Playwright](https://playwright.dev/docs/intro), [Testcontainers for Node](https://node.testcontainers.org).

## Conventions

Every TypeScript snippet in the book comes from `lab/` (same file names, same signatures) and has run green, except sections explicitly marked "not yet run" or "illustrative" (Testcontainers, NestJS, the GitHub Actions workflow, Pact Broker). Error messages in the lab code are written without diacritics to avoid encoding problems.
