# Transactions & Concurrency

A study guide on transactions, isolation levels, MVCC, locks, deadlocks, and patterns against race conditions, written for backend developers (Go and TypeScript/Node.js, with SQL knowledge). The lecture text of the chapters is written in Vietnamese. Every conclusion about PostgreSQL and MySQL behavior has a two-concurrent-session scenario in `lab/` and **was actually run**.

## Who this book is for

Backend developers who have already read about indexes and system design and now need a solid understanding of: why a balance goes wrong when two requests run at the same time, how `REPEATABLE READ` differs between PostgreSQL and MySQL, when to use `SELECT ... FOR UPDATE`, a version column, or SERIALIZABLE, and how to debug when production is stuck on locks.

## Prerequisites

- Basic SQL (SELECT, UPDATE, INSERT, JOIN, indexes).
- Go or TypeScript/Node.js at the level of writing queries with a driver (`database/sql`, `pg`).
- Basic Docker (running `docker compose`).

## Contents

1. [Transactions and ACID](01-transactions-and-acid.md)
2. [Anomalies Under Concurrent Execution](02-anomalies.md)
3. [Isolation Levels: the SQL Standard and Reality (with the table actually run)](03-isolation-level.md)
4. [MVCC: PostgreSQL and InnoDB](04-mvcc.md)
5. [Locks: PostgreSQL and InnoDB](05-lock.md)
6. [Deadlocks, Timeouts and Retries](06-deadlock.md)
7. [Five Ways to Prevent Lost Updates](07-preventing-lost-updates.md)
8. [Write Skew and Phantoms: On-Call Schedules and Room Booking](08-write-skew-and-phantoms.md)
9. [Job Queues with `FOR UPDATE SKIP LOCKED` and `NOWAIT`](09-job-queue-skip-locked.md)
10. [Transactions in Go and TypeScript Applications](10-transactions-in-go-and-typescript.md)
11. [Beyond a Single Database: 2PC, Saga, Outbox](11-beyond-a-single-database.md)
12. [Checklist for Debugging Production Concurrency Incidents](12-checklist-debug-production.md)

Running examples: wallet/account `acct(id, bal, ver)`, on-call doctors `doctors`, room booking `booking(room, s, e)`, queue `jobs`.

## Versions used (checked 2026-11)

| Component | Version | Notes |
|---|---|---|
| PostgreSQL | **18.6** (`SELECT version()`: `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu`) | image `postgres:latest`; the PostgreSQL versioning page lists 18.6 as the current minor release; PostgreSQL 19 is only at the RC stage |
| MySQL | **9.7.4** (`SELECT VERSION()` returns `9.7.4`) | image `mysql:lts` currently points to 9.7 (the LTS track of the 9.x line). Worth noting: the 8.4 LTS track still exists (8.4.13), but `mysql:lts` is no longer 8.4. To use 8.4, change the image in `compose.yaml` to `mysql:8.4` |
| Go | 1.27.3 (`golang:latest`) | `lab/go` actually run in Docker |
| pgx | v5.12.0 | `github.com/jackc/pgx/v5` |
| go-sql-driver/mysql | v1.10.1 | |
| Node.js | 26.13.0 (`node:lts`) | `lab/ts` actually run |
| TypeScript, pg, drizzle-orm | 7.0.2, 8.23.1, 0.45.4 | `tsc --noEmit` clean |
| PgBouncer (cross-checked against docs) | Features page; the latest release in the News section is 1.26.1 | not run in the lab |
| Docker Engine | 29.8.1 | |

Defaults verified in the lab: PostgreSQL `READ COMMITTED`, MySQL `REPEATABLE READ`, `innodb_lock_wait_timeout = 50`, `innodb_deadlock_detect = ON`, `innodb_print_all_deadlocks = OFF`. `compose.yaml` sets `deadlock_timeout=500ms` for PostgreSQL (the default is 1s) so deadlocks show up faster.

## Running the labs

Requirement: Docker. Nothing else to install, no ports mapped to the host.

```bash
cd lab
docker compose up -d --wait          # creates bookcheck-txn-pg (PostgreSQL) and bookcheck-txn-my (MySQL)
# MySQL may need a few more seconds after reporting healthy; check:
docker exec -e MYSQL_PWD=lab bookcheck-txn-my mysql -uroot -e "select version()"
docker exec bookcheck-txn-pg psql -U postgres -d lab -Atc "select version()"
```

Run one scenario (two concurrent sessions):

```bash
./run.sh pg lost_update "READ COMMITTED"            # prints one line: db | scenario | level | YES / no / ERROR
VERBOSE=1 ./run.sh my phantom_update "REPEATABLE READ"   # see the full output
```

Re-run the whole matrix (takes about 10 to 20 minutes per DB):

```bash
./matrix.sh pg > out/matrix.pg.txt
./matrix.sh my > out/matrix.my.txt
./extras.sh pg > out/extras.pg.txt     # deadlock, timeout, skip locked, nowait, FK lock, exclusion, pg_locks, MVCC
./extras.sh my > out/extras.my.txt     # deadlock, timeout, skip locked, nowait, gap lock, MVCC
```

Run the Go program (two concurrent goroutines/transactions, PostgreSQL and MySQL). It uses its own network and containers, independent of `compose.yaml`:

```bash
docker network create bookcheck-txngo-net
docker run -d --name bookcheck-txngo-pg --network bookcheck-txngo-net -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab postgres:latest postgres -c deadlock_timeout=500ms
docker run -d --name bookcheck-txngo-my --network bookcheck-txngo-net -e MYSQL_ROOT_PASSWORD=lab -e MYSQL_DATABASE=lab mysql:lts
# wait for MySQL to start (a few tens of seconds), then:
docker run --rm --network bookcheck-txngo-net -v "$(pwd)/go:/app:ro" \
  -e PG_DSN="postgres://postgres:lab@bookcheck-txngo-pg:5432/lab" \
  -e MYSQL_DSN="root:lab@tcp(bookcheck-txngo-my:3306)/lab" \
  golang:latest sh /app/run.sh        # go mod tidy, go vet, go run .
```

Run the TypeScript part (`tsc --noEmit`, then the `pg` and Drizzle demos):

```bash
docker run --rm --network bookcheck-txngo-net -v "$(pwd)/ts:/app:ro" \
  -e PG_DSN="postgres://postgres:lab@bookcheck-txngo-pg:5432/lab" node:lts sh /app/run.sh
```

On Git Bash for Windows, set `MSYS_NO_PATHCONV=1` before the `docker run` command so the `/app` path is not rewritten.

Clean up when done:

```bash
docker compose down -v
docker rm -f bookcheck-txngo-pg bookcheck-txngo-my
docker network rm bookcheck-txngo-net
```

### Structure of `lab/`

| Path | Contents |
|---|---|
| `compose.yaml` | PostgreSQL and MySQL, no ports mapped |
| `run.sh` | Runs one scenario: splits the `@setup`/`@a`/`@b`/`@final` sections, runs A and B concurrently in the background |
| `matrix.sh`, `extras.sh` | Batch runs |
| `scenarios/pg/*.sql`, `scenarios/my/*.sql` | Scenarios for each anomaly and how to prevent it |
| `scripts/` | Standalone scripts: `ch01_*.sql` (savepoint, DDL), `mvcc_pg.sql` (xmin/xmax, bloat) |
| `go/` | Go code (pgx v5, go-sql-driver/mysql): `RunTx` retry, `transfer`, `optimistic`, `claimer` (SKIP LOCKED), `main.go` runs the concurrent goroutines |
| `ts/` | TypeScript code: `pg` with `BEGIN ISOLATION LEVEL` + retry, and Drizzle `isolationLevel` |
| `out/` | Results already run; `out/go.txt` and `out/ts.txt` are the real output of chapter 10 |

Ordering principle: no `sleep` on the host. Each session calls `pg_sleep()`/`SLEEP()` inside its own SQL. Because `docker exec` has erratic startup latency (sometimes a few seconds), `run.sh` has session A write a row into the `_sync` table while session B waits in SQL until it sees that row; all time marks in a scenario are counted from the moment A starts.

## Limits of the lab

- Each scenario tests **one shape** of an anomaly; it does not replace a full test suite such as Hermitage.
- Each cell in the chapter 3 table is a single run; re-running may differ if environment latency shifts the ordering (the matrix was run twice after adding the `_sync` synchronization, to cross-check).
- Not tested: real PgBouncer (the Go/Node code is only cross-checked against docs), the behavior of `UPDATE` without an index on InnoDB, replication.

## Further reading (verified to exist)

1. Martin Kleppmann, *Designing Data-Intensive Applications*: the Transactions chapter (chapter 7 in the 2017 first edition; chapter 8 in the 2026 second edition, O'Reilly).
2. H. Berenson, P. Bernstein, J. Gray, J. Melton, E. O'Neil, P. O'Neil, "A Critique of ANSI SQL Isolation Levels", SIGMOD 1995 (Microsoft Research MSR-TR-95-51).
3. PostgreSQL documentation, chapter "Concurrency Control" (MVCC, Transaction Isolation, Explicit Locking), `postgresql.org/docs/current/mvcc.html`.
4. MySQL documentation, "InnoDB Locking and Transaction Model" in the MySQL Reference Manual (dev.mysql.com/doc).
5. Martin Kleppmann's Hermitage repo, `github.com/ept/hermitage` (still exists, not archived at the time of checking): isolation level test scenarios for many DBs.
6. pgx v5 documentation (`pkg.go.dev/github.com/jackc/pgx/v5`: `BeginTxFunc`, `TxOptions`, `QueryExecMode`), node-postgres (`node-postgres.com`, Transactions section) and Drizzle ORM (Transactions section); the PgBouncer "Features" page (`pgbouncer.org/features.html`).

## Conventions

Standard terms are kept in English and explained on first use. Each chapter has: scenario, mechanism, example/lab, trade-offs, pitfalls, summary, and self-check questions (answers in a `<details>` block).
