# Chương 10. Transaction trong ứng dụng Go và TypeScript

## 1. Tình huống

Bạn đã hiểu anomaly, lock, deadlock. Nhưng code thật là một hàm `func(tx pgx.Tx) error` hay một callback `async (tx) => {...}`, bên trong có query, có gọi dịch vụ thanh toán, có đẩy event gửi email. Chương này nối kiến thức DB với driver Go (`pgx`, `go-sql-driver/mysql`) và Node (`pg`, Drizzle ORM).

Khác với các chương trước, **toàn bộ code của chương này đã chạy thật** trong Docker, trên PostgreSQL 18.6 và MySQL 9.7.4. Output nằm ở `lab/out/go.txt` và `lab/out/ts.txt`, được trích lại bên dưới.

| Thành phần | Phiên bản (kiểm tra 11/2026) |
|---|---|
| Go | 1.27.3 (image `golang:latest`) |
| `github.com/jackc/pgx/v5` | v5.12.0 |
| `github.com/go-sql-driver/mysql` | v1.10.1 |
| Node.js | 26.13.0 (image `node:lts`, tên LTS "Lithium") |
| TypeScript | 7.0.2 (`tsc --noEmit` không báo lỗi) |
| `pg` (node-postgres) / `@types/pg` | 8.23.1 |
| `drizzle-orm` | 0.45.4 (Prisma cũng có interactive transaction với `isolationLevel`, nhưng cần bước generate client và query engine; chọn Drizzle cho gọn) |

Cấu trúc code:

| File | Nội dung |
|---|---|
| `lab/go/retry.go` | `IsRetryable`, `RunTx`: `pgx.BeginTxFunc` + retry `40001`/`40P01` |
| `lab/go/transfer.go` | chuyển tiền, lock theo thứ tự id (và bản lock sai thứ tự để minh họa deadlock) |
| `lab/go/optimistic.go` | optimistic locking bằng cột `ver` |
| `lab/go/claimer.go` | job claimer `FOR UPDATE SKIP LOCKED` |
| `lab/go/mysql.go` | SERIALIZABLE + retry mã 1213/1205 với `database/sql` |
| `lab/go/main.go` | chương trình chạy các goroutine đồng thời |
| `lab/ts/src/retry.ts`, `lab/ts/src/demo.ts` | `pg` và Drizzle |

## 2. Transaction trong pgx

`pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{IsoLevel: ...}, fn)` mở transaction, gọi `fn`, rồi `COMMIT` nếu `fn` trả `nil`, `ROLLBACK` nếu trả lỗi (hoặc panic). `pool` có thể là `*pgxpool.Pool` hoặc `*pgx.Conn`. Isolation level được gửi trong chính câu `BEGIN ISOLATION LEVEL ...`, nên không có chuyện đặt sai thứ tự như câu `SET TRANSACTION` thủ công. Các hằng số: `pgx.ReadCommitted`, `pgx.RepeatableRead`, `pgx.Serializable`. Lỗi trả về có thể đến từ **COMMIT** (SERIALIZABLE hay báo `40001` ở đó), nên phải xử lý lỗi của cả `BeginTxFunc`, không chỉ lỗi bên trong `fn`.

Nhận diện lỗi cần retry bằng `*pgconn.PgError` và `errors.As`, theo SQLSTATE chứ không theo message (`lab/go/retry.go`):

```go
func IsRetryable(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40001" || pgErr.Code == "40P01"
	}
	return false
}

func RunTx(ctx context.Context, pool *pgxpool.Pool, iso pgx.TxIsoLevel, maxAttempts int, fn func(tx pgx.Tx) error) (int, error) {
	for attempt := 1; ; attempt++ {
		err := pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{IsoLevel: iso}, fn)
		if err == nil {
			return attempt, nil
		}
		if !IsRetryable(err) || attempt >= maxAttempts {
			return attempt, fmt.Errorf("after %d attempts: %w", attempt, err)
		}
		select {
		case <-time.After(backoff(attempt)): // random jitter, grows with attempt
		case <-ctx.Done():
			return attempt, ctx.Err()
		}
	}
}
```

Quy tắc của chương 6 áp dụng nguyên vẹn: retry **cả transaction** (đọc lại từ đầu, không dùng lại biến cũ), giới hạn số lần, có jitter, và `fn` không có side effect ngoài DB. `55P03` (`lock_timeout`) cố ý không nằm trong danh sách retry: hết thời gian chờ lock thường nghĩa là có transaction khác giữ lock quá lâu, retry ngay chỉ làm tăng tải.

**Savepoint:** `tx.Begin(ctx)` trên một `pgx.Tx` đang mở không tạo transaction mới mà tạo savepoint (`pgx.Tx` lồng nhau); `Rollback` của nó là `ROLLBACK TO SAVEPOINT`. Với PostgreSQL đó là cách để "bắt lỗi rồi đi tiếp" trong cùng transaction (chương 1). Retry luôn đặt ở transaction ngoài cùng, như `RunTx`: với MySQL, deadlock đã rollback cả transaction (chương 6), không chỉ phần trong savepoint.

## 3. Lost update và cách chặn (đã chạy)

`main.go` chạy hai goroutine nạp +10 và +20 vào ví có 100 (kết quả đúng: 130). Goroutine thứ hai bắt đầu sau 100ms, mỗi bên giữ transaction 300ms giữa lúc đọc và ghi để hai transaction chắc chắn chồng lên nhau. Chỉ dùng `time.Sleep` để tạo chồng lấn trong demo; code thật không có chúng.

Dạng lỗi (đọc vào biến Go rồi ghi lại), READ COMMITTED:

```go
var bal int
tx.QueryRow(ctx, `SELECT bal FROM acct WHERE id=1`).Scan(&bal)
tx.Exec(ctx, `UPDATE acct SET bal=$1 WHERE id=1`, bal+amt)
```

Chặn bằng `SELECT ... FOR UPDATE`: cùng hàm `readThenWrite` trong `main.go`, chỉ thêm hậu tố ` FOR UPDATE` vào câu SELECT.

Optimistic locking, `lab/go/optimistic.go`:

```go
tag, err := pool.Exec(ctx,
	`UPDATE acct SET bal = $1, ver = ver + 1 WHERE id = $2 AND ver = $3`, bal+amount, id, ver)
if tag.RowsAffected() == 1 { return try, nil }   // 0 rows: someone wrote first, read again
```

SERIALIZABLE kèm retry dùng lại đúng `readThenWrite` với `pgx.Serializable` và `RunTx`. Output thật (`lab/out/go.txt`, PostgreSQL 18.6):

```text
== 1. lost update, READ COMMITTED, plain SELECT (expected 130)
final balance = 120

== 2. SELECT ... FOR UPDATE
deposit +10: attempts=1 err=<nil>
deposit +20: attempts=1 err=<nil>
final balance = 130

== 3. optimistic locking with a version column
deposit +10: tries=1 err=<nil>
deposit +20: tries=2 err=<nil>
final balance = 130, ver = 2

== 4. SERIALIZABLE + retry on 40001
deposit +10: attempts=1 err=<nil>
deposit +20: attempts=2 err=<nil>
final balance = 130

== 4b. SERIALIZABLE without retry (maxAttempts=1)
deposit +10: err=<nil>
deposit +20: err=after 1 attempts: ERROR: could not serialize access due to concurrent update (SQLSTATE 40001)
final balance = 110 (the failed deposit is not applied, no silent corruption)
```

Đọc kết quả:

- Mục 1: mất đúng khoản +10 (120 thay vì 130). Cả hai goroutine đều đọc 100.
- Mục 2: `FOR UPDATE` làm goroutine thứ hai chờ ở câu SELECT, đọc lại số 110 sau khi bên kia commit; cả hai chỉ chạy một lần.
- Mục 3: không lock, không transaction; bên đến sau thấy `ver` đã đổi (0 dòng bị ảnh hưởng), đọc lại và thành công ở lần thứ hai. `ver = 2` chứng tỏ hai lần ghi đều thành công.
- Mục 4 và 4b: ở SERIALIZABLE (ở đây PostgreSQL báo `40001` với message "could not serialize access due to concurrent update" vì hai bên cùng sửa một dòng), không có retry thì một khoản nạp thất bại. Có `RunTx` thì lần thử thứ hai thành công. Thất bại ở đây là lỗi rõ ràng, không phải dữ liệu sai âm thầm.

## 4. Chuyển tiền và deadlock (đã chạy)

`lab/go/transfer.go` lock hai ví bằng một câu `SELECT ... WHERE id = ANY($1) ORDER BY id FOR UPDATE`, nên mọi transaction lấy lock theo cùng thứ tự id (chương 6), rồi dùng hai câu `UPDATE ... SET bal = bal ± $1` atomic. Hàm `TransferUnordered` cố tình trừ ví nguồn trước rồi mới cộng ví đích để tạo deadlock. Hai chuyển khoản ngược chiều (1 sang 2 và 2 sang 1), mỗi bên giữ 300ms giữa hai câu UPDATE:

```text
== 5. opposite transfers, unordered locks -> deadlock 40P01, retried
transfer 2->1: attempts=1 err=<nil>
transfer 1->2: attempts=2 err=<nil>
total = 200 (expected 200)

== 6. opposite transfers, ordered locks -> no deadlock
transfer 2->1: attempts=1 err=<nil>
transfer 1->2: attempts=1 err=<nil>
total = 200 (expected 200)
```

Ở mục 5, PostgreSQL phát hiện deadlock (`deadlock_timeout=500ms` trong lab), hủy một bên bằng `40P01`, `RunTx` chạy lại và tổng tiền vẫn đúng. Ở mục 6 không bên nào phải retry. Thứ tự lock là cách phòng bệnh; retry là lưới an toàn.

## 5. Job claimer với SKIP LOCKED (đã chạy)

`lab/go/claimer.go`:

```go
rows, err := tx.Query(ctx, `SELECT id FROM jobs WHERE state = 'new' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, limit)
ids, err = pgx.CollectRows(rows, pgx.RowTo[int])
// ... then: UPDATE jobs SET state = 'running', worker = $1 WHERE id = ANY($2)
```

Ba worker (W1, W2, W3) nhận đồng thời, mỗi worker lấy tối đa 2 trong 6 job, giữ transaction 500ms:

```text
== 7. job claimer, 3 workers x 2 jobs of 6, SKIP LOCKED
W1 claimed [1 2] err=<nil>
W3 claimed [3 4] err=<nil>
W2 claimed [5 6] err=<nil>
running=6 workers=3 (expected 6 and 3)
```

Không job nào bị nhận hai lần và không worker nào phải chờ worker khác, vì dòng đang bị lock được bỏ qua. Nhớ rằng phải `CollectRows` (hoặc đọc hết rows) trước khi `Exec` tiếp trên cùng transaction, vì một connection chỉ chạy được một câu lệnh tại một thời điểm.

## 6. MySQL với go-sql-driver/mysql (đã chạy)

Với MySQL, `database/sql` làm phần khó: `db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})` được driver chuyển thành `SET TRANSACTION ISOLATION LEVEL ...` chạy ngay trước `START TRANSACTION`, đúng thứ tự mà chương 3 nói MySQL đòi hỏi. Lỗi cần retry là `*mysql.MySQLError` với `Number` 1213 (deadlock; SERIALIZABLE conflict cũng ra mã này, chương 7) hoặc 1205 (lock wait timeout). Khác PostgreSQL, 1205 được xếp vào nhóm retry được ở đây; hãy cân nhắc theo tình huống như đã nói ở mục 2. Code ở `lab/go/mysql.go`:

```go
func IsMySQLRetryable(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && (me.Number == 1213 || me.Number == 1205)
}
```

Hai goroutine nạp +10 và +20 ở SERIALIZABLE: cả hai đọc (InnoDB biến SELECT thường thành shared lock ở level này), cả hai cùng UPDATE, nên một bên bị hủy bằng 1213 và được retry:

```text
== 8. MySQL: SERIALIZABLE + retry on 1213
mysql deposit +10: attempts=1 err=<nil>
mysql deposit +20: attempts=2 err=<nil>
mysql final balance = 130 (expected 130)
```

Cũng như PostgreSQL, `database/sql` có pool: `db.BeginTx` lấy một connection ra khỏi pool và giữ nó đến `Commit`/`Rollback`. Luôn dùng `tx.ExecContext`/`tx.QueryRowContext`, không dùng `db.*` bên trong transaction (xem mục 9).

## 7. TypeScript: pg và Drizzle

### 7.1. node-postgres: tự quản lý connection

Trong `pg`, **mỗi transaction phải chạy trên một connection duy nhất** lấy bằng `pool.connect()`. `pool.query()` có thể dùng connection khác cho mỗi câu, nên `pool.query("BEGIN")` rồi `pool.query("UPDATE ...")` là sai. `lab/ts/src/retry.ts`:

```ts
export async function withTx<T>(pool: Pool, isolation: Isolation,
  fn: (client: PoolClient) => Promise<T>, maxAttempts = 5) {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await fn(client);
      await client.query("COMMIT");
      client.release(); // success path: give the connection back
      return { result, attempts: attempt };
    } catch (err) {
      let broken = false;
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      if (broken) client.release(true); else client.release(); // true = destroy the connection
      if (!isRetryable(err) || attempt >= maxAttempts) throw err;
      await sleep(Math.random() * 20 * attempt + 1);
    }
  }
}
```

`isRetryable` đọc `err.code` (`"40001"` hoặc `"40P01"`) và đi ngược chuỗi `err.cause`, vì ORM thường bọc lỗi của driver. Hai lần chạy đầu của chính lab này cũng minh họa cạm bẫy pool: bản đầu của `withTx` quên `client.release()` ở đường thành công, và `pool.end()` treo vô hạn vì connection không bao giờ được trả. Rò connection kiểu này trong server thật sẽ cạn pool sau vài request.

### 7.2. Drizzle: interactive transaction có isolationLevel

Drizzle nhận isolation level qua tham số thứ hai của `db.transaction` (giá trị `"read committed" | "repeatable read" | "serializable"`, theo docs của Drizzle cho PostgreSQL). Bản thân Drizzle không retry, bạn tự bọc vòng lặp như ở Go:

```ts
await db.transaction(async (tx) => {
  const [row] = await tx.select({ bal: acct.bal }).from(acct).where(eq(acct.id, 1));
  await tx.update(acct).set({ bal: row!.bal + amt }).where(eq(acct.id, 1));
}, { isolationLevel: "serializable" });
```

Dùng `tx`, không dùng `db`, bên trong callback. Output thật (`lab/out/ts.txt`, Node 26.13.0; kiểm kiểu bằng `tsc --noEmit` trước khi chạy):

```text
== pg: SERIALIZABLE + retry
deposit +10: attempts=1
deposit +20: attempts=2
final balance = 130 (expected 130)
== pg: SERIALIZABLE, maxAttempts=1
deposit +10: ok
deposit +20: code=40001 retryable=true
final balance = 110
== pg: SELECT ... FOR UPDATE
final balance = 130 (expected 130)
== drizzle: transaction({ isolationLevel: 'serializable' }) + retry
deposit +10: attempts=1
deposit +20: attempts=2
final balance = 130 (expected 130)
```

### 7.3. Cạm bẫy riêng của Node

1. **Pool và transaction:** transaction gắn với một `PoolClient`, không phải với `pool`. Mọi câu lệnh của transaction phải đi qua `client` (hoặc `tx` của ORM).
2. **async/await làm lẫn connection:** nếu `fn` gọi một hàm repository dùng `pool.query` (hoặc `db` thay vì `tx`), câu lệnh đó chạy ở connection khác, ngoài transaction, không thấy dữ liệu chưa commit và không được rollback. Compiler không bắt được lỗi này; hãy truyền `tx`/`client` làm tham số tường minh.
3. **Quên `await`:** `client.query(...)` không `await` rồi `COMMIT` ngay có thể làm câu lệnh chạy sau commit hoặc lỗi bị nuốt thành unhandled rejection.
4. **Song song trong một transaction:** `Promise.all([tx.a(), tx.b()])` trên cùng một connection chỉ được xếp hàng tuần tự (hoặc, với một số driver, lỗi). Không có lợi ích gì.
5. **Quên release connection** (xem 7.1): luôn `release` ở cả đường thành công lẫn lỗi.

## 8. Không gọi API ngoài trong transaction

Sai (Go, tương tự trong TypeScript):

```go
pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
	tx.Exec(ctx, `UPDATE orders SET status='paid' WHERE id=$1`, id)
	http.Post("https://payment.example/charge", ...)   // slow, may be retried, cannot be rolled back
	return mailer.Send(...)
})
```

Vấn đề: (1) giữ lock/snapshot trong lúc chờ mạng (chương 4); (2) `RunTx` có thể chạy `fn` nhiều lần, nên khoản thanh toán bị gọi nhiều lần; (3) nếu commit thất bại sau khi gọi, hai phía lệch nhau. Trong Node còn thêm: transaction giữ một connection của pool suốt thời gian chờ HTTP, vài request chậm là cạn pool.

Đúng: làm việc DB trong transaction, việc ngoài **sau commit**: `BeginTxFunc` trả về `nil` rồi mới gọi API/đẩy event. Nếu process chết giữa commit và lúc gọi thì việc ngoài bị mất; yêu cầu mạnh hơn dùng outbox (ghi một dòng `outbox` trong cùng transaction, worker khác đẩy đi, chương 11). Đừng dispatch job vào queue ngoài DB trước khi commit: worker có thể lấy job trước khi commit và không thấy dữ liệu.

Test: cần hai connection thật để kiểm lock/deadlock; test bọc mỗi case trong một transaction rồi rollback chỉ có một connection nên không kiểm được hành vi hai session.

## 9. Connection pool và PgBouncer transaction pooling

Mỗi connection PostgreSQL là một process (`max_connections` mặc định 100). Nhiều instance ứng dụng, mỗi instance một pool, dễ chạm giới hạn, nên người ta đặt PgBouncer ở giữa. Trong **transaction pooling**, một connection thật chỉ gán cho client trong lúc một transaction chạy, rồi trả lại pool.

Theo trang "Features" của PgBouncer (bản mới nhất ở mục News là 1.26.1), các thứ sau **không dùng được** trong transaction pooling: `SET`/`RESET` session-level, `LISTEN`, `WITH HOLD CURSOR`, `PREPARE`/`DEALLOCATE` dạng câu lệnh SQL, temp table `PRESERVE`/`DELETE ROWS`, `LOAD`, và **session-level advisory lock** (`pg_advisory_lock`). Prepared statement ở protocol-level chỉ được hỗ trợ khi đặt `max_prepared_statements` khác 0 (mặc định không bật). Phần này đối chiếu docs, **chưa chạy PgBouncer trong lab**.

| Muốn | Trong transaction pooling |
|---|---|
| Tham số theo transaction | `SET LOCAL lock_timeout = '2s'` bên trong transaction |
| Advisory lock | `pg_advisory_xact_lock(...)`, không dùng `pg_advisory_lock` |
| `statement_timeout` | đặt theo role/database, hoặc `SET LOCAL`; `SET` session không đáng tin |
| `LISTEN/NOTIFY`, migration | dùng connection trực tiếp, không qua pooler |

**Driver Go (pgx):** mặc định pgx v5 dùng `QueryExecModeCacheStatement`: tự `PREPARE` rồi cache statement theo connection. Qua PgBouncer transaction pooling (không bật `max_prepared_statements`), câu sau có thể rơi vào connection khác không có statement đó và báo lỗi kiểu `prepared statement "stmtcache_..." does not exist`. Cách xử lý: đặt chế độ khác trong connection string, ví dụ `postgres://...?default_query_exec_mode=exec` (hoặc `simple_protocol`, hoặc `cache_describe` nếu pooler hỗ trợ), hoặc `config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec` khi dùng `pgxpool.ParseConfig`. Đánh đổi: mất cache statement, mỗi lần gửi thêm round trip hoặc dùng text format. `SET` session và `pg_advisory_lock` trong code Go sẽ chạy sai theo cách im lặng, vì `*pgxpool.Pool` không biết connection thật đã đổi.

**Driver Node (`pg`):** truy vấn có tham số mà không đặt `name` dùng unnamed prepared statement, thường ổn với PgBouncer. Query có `name: "..."` (named prepared statement) thì giống tình huống của pgx, nên tránh khi qua transaction pooling (hoặc bật `max_prepared_statements`). Một pool phía Node có thể giữ vài connection tới PgBouncer, nhưng đừng giữ transaction mở lâu, vì connection thật bị giữ suốt transaction.

Worker chạy dài giữ connection lâu: transaction treo do bug (quên rollback, quên release) giữ lock đến khi connection đóng. Đặt `idle_in_transaction_session_timeout` ở PostgreSQL làm lưới an toàn.

## 10. Cạm bẫy

1. `RunTx` retry nhưng `fn` có side effect (email, HTTP, ghi file).
2. `SELECT ... FOR UPDATE` ngoài transaction (ví dụ `pool.Exec`/`pool.query` đơn lẻ): lock nhả ngay khi câu lệnh autocommit xong.
3. Chỉ kiểm `err` bên trong `fn` mà bỏ qua lỗi của `COMMIT` (SERIALIZABLE hay báo `40001` ở đó).
4. Dùng `pool`/`db` thay vì `tx`/`client` bên trong transaction, nên câu lệnh chạy ngoài transaction.
5. Quên `release` connection (Node) hoặc quên `Rollback`/`Close rows` (Go) trong code tự quản lý.
6. Dùng `SET` session, `pg_advisory_lock`, prepared statement cache qua PgBouncer transaction pooling.
7. Retry không giới hạn, không jitter.
8. Test đồng thời bằng một connection duy nhất.

## 11. Tóm tắt

- Go: `pgx.BeginTxFunc` + `TxOptions{IsoLevel}`; lỗi cần retry nhận ra bằng `*pgconn.PgError.Code` (`40001`, `40P01`); MySQL là `*mysql.MySQLError.Number` (1213, 1205). Retry cả transaction, có giới hạn và jitter.
- Node: transaction gắn với một `PoolClient`; Drizzle nhận `isolationLevel` trong `db.transaction`, tự bạn viết retry.
- Đã chạy thật: `FOR UPDATE`, optimistic version và SERIALIZABLE + retry đều cho 130; deadlock được retry; `SKIP LOCKED` chia 6 job cho 3 worker không trùng.
- Việc ngoài DB (HTTP, mail, event) làm sau commit, hoặc dùng outbox.
- PgBouncer transaction pooling: không `SET` session và advisory lock session; với pgx đổi `default_query_exec_mode`; với `pg` tránh named prepared statement.

## 12. Tự kiểm tra

1. Lỗi nào cần retry ở PostgreSQL và MySQL, và nhận ra bằng cách nào trong Go?
2. Vì sao `pool.query("BEGIN")` rồi `pool.query("UPDATE ...")` trong Node là sai?
3. Vì sao không nên gọi API thanh toán bên trong `fn` của transaction?
4. Dùng pgx với mặc định qua PgBouncer transaction pooling có thể gặp lỗi gì, và sửa thế nào?
5. Dùng `pg_advisory_lock` qua PgBouncer transaction pooling có vấn đề gì và thay bằng gì?

<details><summary>Đáp án</summary>

1. PostgreSQL: SQLSTATE `40001`, `40P01` (`errors.As` với `*pgconn.PgError`, so `Code`). MySQL: 1213 và 1205 (`*mysql.MySQLError.Number`).
2. `pool.query` có thể dùng connection khác cho mỗi câu; phải `pool.connect()` và chạy cả transaction trên một `client`.
3. Giữ lock/connection lâu, bị gọi lại khi retry/rollback, không rollback được phía ngoài.
4. Statement cache (`QueryExecModeCacheStatement`) tạo prepared statement theo connection, câu sau có thể đến connection khác và lỗi "prepared statement does not exist". Dùng `default_query_exec_mode=exec` hoặc `simple_protocol`, hoặc bật `max_prepared_statements` ở PgBouncer.
5. Lock gắn với connection thật có thể không còn thuộc client sau transaction. Dùng `pg_advisory_xact_lock` trong transaction.
</details>
