# Transaction, Isolation & Concurrency cho developer

Bản học bằng tiếng Việt về transaction, isolation level, MVCC, lock, deadlock và các mẫu chống race condition, viết cho developer backend (Go và TypeScript/Node.js, có biết SQL). Mọi kết luận về hành vi của PostgreSQL và MySQL đều có kịch bản hai session đồng thời trong `lab/` và **đã được chạy thật**.

## Ai nên đọc

Developer backend đã đọc về index và system design, đang cần hiểu chắc: vì sao số dư lệch khi hai request chạy cùng lúc, `REPEATABLE READ` của PostgreSQL và MySQL khác nhau ra sao, khi nào dùng `SELECT ... FOR UPDATE`, version column hay SERIALIZABLE, và cách debug khi production kẹt lock.

## Kiến thức cần có

- SQL cơ bản (SELECT, UPDATE, INSERT, JOIN, index).
- Go hoặc TypeScript/Node.js ở mức viết được truy vấn bằng driver (`database/sql`, `pg`).
- Docker cơ bản (chạy `docker compose`).

## Mục lục

1. [Transaction và ACID](01-transactions-and-acid.md)
2. [Các anomaly khi chạy đồng thời](02-anomalies.md)
3. [Isolation level: chuẩn SQL và thực tế (bảng đã chạy)](03-isolation-level.md)
4. [MVCC: PostgreSQL và InnoDB](04-mvcc.md)
5. [Lock: PostgreSQL và InnoDB](05-lock.md)
6. [Deadlock, timeout và retry](06-deadlock.md)
7. [Năm cách chống lost update](07-preventing-lost-updates.md)
8. [Write skew và phantom: lịch trực, đặt phòng](08-write-skew-and-phantoms.md)
9. [Job queue bằng SKIP LOCKED và NOWAIT](09-job-queue-skip-locked.md)
10. [Transaction trong ứng dụng Go và TypeScript](10-transactions-in-go-and-typescript.md)
11. [Vượt ra ngoài một database: 2PC, saga, outbox](11-beyond-a-single-database.md)
12. [Checklist debug concurrency incident trên production](12-checklist-debug-production.md)

Ví dụ xuyên suốt: ví/tài khoản `acct(id, bal, ver)`, bác sĩ trực `doctors`, đặt phòng `booking(room, s, e)`, queue `jobs`.

## Phiên bản đã dùng (kiểm tra 11/2026)

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| PostgreSQL | **18.6** (`SELECT version()`: `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu`) | image `postgres:latest`; trang versioning của PostgreSQL liệt kê 18.6 là minor hiện hành; PostgreSQL 19 mới ở giai đoạn RC |
| MySQL | **9.7.4** (`SELECT VERSION()` trả `9.7.4`) | image `mysql:lts` lúc này trỏ tới 9.7 (nhánh LTS của dòng 9.x). Đáng chú ý: nhánh LTS 8.4 vẫn tồn tại (8.4.13), nhưng `mysql:lts` không còn là 8.4. Muốn dùng 8.4 hãy đổi image trong `compose.yaml` thành `mysql:8.4` |
| Go | 1.27.3 (`golang:latest`) | chạy thật `lab/go` trong Docker |
| pgx | v5.12.0 | `github.com/jackc/pgx/v5` |
| go-sql-driver/mysql | v1.10.1 | |
| Node.js | 26.13.0 (`node:lts`) | chạy thật `lab/ts` |
| TypeScript, pg, drizzle-orm | 7.0.2, 8.23.1, 0.45.4 | `tsc --noEmit` sạch |
| PgBouncer (đối chiếu docs) | trang Features, bản mới nhất ở mục News là 1.26.1 | không chạy trong lab |
| Docker Engine | 29.8.1 | |

Mặc định đã kiểm trong lab: PostgreSQL `READ COMMITTED`, MySQL `REPEATABLE READ`, `innodb_lock_wait_timeout = 50`, `innodb_deadlock_detect = ON`, `innodb_print_all_deadlocks = OFF`. `compose.yaml` đặt `deadlock_timeout=500ms` cho PostgreSQL (mặc định là 1s) để deadlock hiện nhanh hơn.

## Cách chạy lab

Yêu cầu: Docker. Không cần cài gì khác, không map port ra host.

```bash
cd lab
docker compose up -d --wait          # tạo bookcheck-txn-pg (PostgreSQL) và bookcheck-txn-my (MySQL)
# MySQL có thể cần thêm vài giây sau khi báo healthy; kiểm tra:
docker exec -e MYSQL_PWD=lab bookcheck-txn-my mysql -uroot -e "select version()"
docker exec bookcheck-txn-pg psql -U postgres -d lab -Atc "select version()"
```

Chạy một kịch bản (hai session đồng thời):

```bash
./run.sh pg lost_update "READ COMMITTED"            # in một dòng: db | kịch bản | level | CÓ / không / LỖI
VERBOSE=1 ./run.sh my phantom_update "REPEATABLE READ"   # xem toàn bộ output
```

Chạy lại cả ma trận (mất khoảng 10 đến 20 phút mỗi DB):

```bash
./matrix.sh pg > out/matrix.pg.txt
./matrix.sh my > out/matrix.my.txt
./extras.sh pg > out/extras.pg.txt     # deadlock, timeout, skip locked, nowait, FK lock, exclusion, pg_locks, MVCC
./extras.sh my > out/extras.my.txt     # deadlock, timeout, skip locked, nowait, gap lock, MVCC
```

Chạy chương trình Go (hai goroutine/transaction đồng thời, PostgreSQL và MySQL). Dùng network và container riêng, không phụ thuộc `compose.yaml`:

```bash
docker network create bookcheck-txngo-net
docker run -d --name bookcheck-txngo-pg --network bookcheck-txngo-net -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab postgres:latest postgres -c deadlock_timeout=500ms
docker run -d --name bookcheck-txngo-my --network bookcheck-txngo-net -e MYSQL_ROOT_PASSWORD=lab -e MYSQL_DATABASE=lab mysql:lts
# chờ MySQL khởi động (vài chục giây), rồi:
docker run --rm --network bookcheck-txngo-net -v "$(pwd)/go:/app:ro" \
  -e PG_DSN="postgres://postgres:lab@bookcheck-txngo-pg:5432/lab" \
  -e MYSQL_DSN="root:lab@tcp(bookcheck-txngo-my:3306)/lab" \
  golang:latest sh /app/run.sh        # go mod tidy, go vet, go run .
```

Chạy phần TypeScript (`tsc --noEmit`, rồi demo `pg` và Drizzle):

```bash
docker run --rm --network bookcheck-txngo-net -v "$(pwd)/ts:/app:ro" \
  -e PG_DSN="postgres://postgres:lab@bookcheck-txngo-pg:5432/lab" node:lts sh /app/run.sh
```

Trên Git Bash của Windows, đặt `MSYS_NO_PATHCONV=1` trước lệnh `docker run` để đường dẫn `/app` không bị đổi.

Dọn dẹp khi xong:

```bash
docker compose down -v
docker rm -f bookcheck-txngo-pg bookcheck-txngo-my
docker network rm bookcheck-txngo-net
```

### Cấu trúc `lab/`

| Đường dẫn | Nội dung |
|---|---|
| `compose.yaml` | PostgreSQL và MySQL, không map port |
| `run.sh` | Chạy một kịch bản: tách mục `@setup`/`@a`/`@b`/`@final`, chạy A và B nền đồng thời |
| `matrix.sh`, `extras.sh` | Chạy hàng loạt |
| `scenarios/pg/*.sql`, `scenarios/my/*.sql` | Kịch bản từng anomaly và cách chặn |
| `scripts/` | Script đơn lẻ: `ch01_*.sql` (savepoint, DDL), `mvcc_pg.sql` (xmin/xmax, bloat) |
| `go/` | Code Go (pgx v5, go-sql-driver/mysql): `RunTx` retry, `transfer`, `optimistic`, `claimer` (SKIP LOCKED), `main.go` chạy các goroutine đồng thời |
| `ts/` | Code TypeScript: `pg` với `BEGIN ISOLATION LEVEL` + retry, và Drizzle `isolationLevel` |
| `out/` | Kết quả đã chạy; `out/go.txt` và `out/ts.txt` là output thật của chương 10 |

Nguyên tắc sắp thứ tự: không `sleep` trên host. Mỗi session tự `pg_sleep()`/`SLEEP()` bên trong SQL. Vì `docker exec` có latency khởi động thất thường (có lúc vài giây), `run.sh` cho session A ghi một dòng vào bảng `_sync`, còn session B chờ trong SQL cho tới khi thấy dòng đó; mọi mốc thời gian trong kịch bản được tính từ lúc A bắt đầu.

## Giới hạn của lab

- Mỗi kịch bản kiểm tra **một hình dạng** của anomaly, không thay thế bộ kiểm tra đầy đủ như Hermitage.
- Mỗi ô trong bảng chương 3 là một lần chạy; chạy lại có thể khác nếu latency môi trường làm lệch thứ tự (ma trận đã được chạy hai lần sau khi thêm đồng bộ `_sync` để đối chiếu).
- Chưa kiểm: PgBouncer thực tế (code Go/Node chỉ đối chiếu docs), hành vi `UPDATE` không có index trên InnoDB, replication.

## Đọc thêm (đã kiểm tra là tồn tại)

1. Martin Kleppmann, *Designing Data-Intensive Applications*: chương Transactions (chương 7 ấn bản 1 năm 2017; chương 8 ấn bản 2 năm 2026, O'Reilly).
2. H. Berenson, P. Bernstein, J. Gray, J. Melton, E. O'Neil, P. O'Neil, "A Critique of ANSI SQL Isolation Levels", SIGMOD 1995 (Microsoft Research MSR-TR-95-51).
3. Tài liệu PostgreSQL, chương "Concurrency Control" (MVCC, Transaction Isolation, Explicit Locking), `postgresql.org/docs/current/mvcc.html`.
4. Tài liệu MySQL, "InnoDB Locking and Transaction Model" trong MySQL Reference Manual (dev.mysql.com/doc).
5. Repo Hermitage của Martin Kleppmann, `github.com/ept/hermitage` (còn tồn tại, không bị archive tại thời điểm kiểm tra): kịch bản kiểm tra isolation level cho nhiều DB.
6. Tài liệu pgx v5 (`pkg.go.dev/github.com/jackc/pgx/v5`: `BeginTxFunc`, `TxOptions`, `QueryExecMode`), node-postgres (`node-postgres.com`, mục Transactions) và Drizzle ORM (mục Transactions); trang "Features" của PgBouncer (`pgbouncer.org/features.html`).

## Quy ước

Thuật ngữ chuẩn giữ nguyên tiếng Anh, giải thích ở lần đầu. Mỗi chương có: tình huống, cơ chế, ví dụ/lab, trade-off, cạm bẫy, tóm tắt và câu hỏi tự kiểm tra (đáp án trong thẻ `<details>`).
