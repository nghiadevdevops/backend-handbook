# Lab: Testing cho layered architecture và Hexagonal (TypeScript)

Chạy hoàn toàn bằng Docker (không cài Node/npm lên máy). Tài nguyên có tiền tố `bookcheck-testts-`.

```bash
./run.sh up         # network, volume node_modules, PostgreSQL 18 (256 MB)
./run.sh install    # npm ci trong container node:26
./run.sh all        # toàn bộ test Vitest (unit, application, acceptance, http, integration, characterization, contract + Pact)
./run.sh mutation   # StrykerJS
./run.sh e2e        # Playwright trong image chính thức
./run.sh down       # dọn container, network, volume, thư mục sinh ra
```

Các lệnh con khác: `typecheck`, `unit`, `app`, `accept`, `http`, `integ`, `charact`, `contract`, `pact`, `trace`, `exec <lệnh>`. Trên Windows dùng Git Bash. Xem README của sách để biết kết quả mong đợi.

Bố cục: `src/` (`domain`, `application`, `infrastructure`, `http`, `legacy`, `composition.ts`, `server.ts`), `tests/` (`unit`, `application`, `acceptance`, `http`, `integration`, `characterization`, `contract` (+ `pact/`), `e2e`, `support`), `db/schema.sql`, `docs/acceptance-criteria.md`, `scripts/trace.sh`.

Lưu ý: `package.json` ghim `typescript` 6.0.3 vì StrykerJS 10.1.1 chưa chạy được với TypeScript 7 (xem chương 11). Chạy `./run.sh up` trước mọi lệnh (nó tạo network và volume); chỉ `integ` và `all` cần container PostgreSQL; các lệnh còn lại (kể cả `mutation` và `e2e`) không dùng PostgreSQL.
