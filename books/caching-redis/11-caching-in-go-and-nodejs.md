# Chapter 11. Caching in Go and Node.js applications

## 1. The problem

Bạn đã hiểu cơ chế ở các chương trước. Giờ cần dùng chúng trong code thật: Go là ngôn ngữ chính (có chạy thật), Node.js/TypeScript là phần bổ sung. Toàn bộ code nằm trong `lab/go/` và `lab/node/`; mọi đoạn trích bên dưới ghi rõ file nguồn. Tên file chương giữ nguyên là `11-caching-in-go-and-nodejs.md` (tên cũ) để không vỡ link; nội dung đã viết lại hoàn toàn.

Hai nguyên tắc xuyên suốt: ít dependency (stdlib khi đủ) và **đo số query DB thật** thay vì tin vào trực giác.

## 2. Choosing libraries (checked 11/2026)

| Thư viện | Phiên bản | Trạng thái | Ghi chú |
|---|---|---|---|
| `github.com/valkey-io/valkey-go` | v1.0.79 (15/10/2026) | đang phát triển tích cực | Client Valkey (xuất phát từ rueidis), auto-pipelining, command builder có kiểu; nói RESP nên dùng được với cả Redis |
| `github.com/redis/go-redis/v9` | v9.23.0 (05/10/2026) | đang phát triển tích cực | Client chính thức của Redis, phổ biến nhất trong hệ Go |
| `github.com/jackc/pgx/v5` | v5.12.0 (bản `go mod tidy` chọn) | đang phát triển | Driver và pool PostgreSQL |
| `golang.org/x/sync/singleflight` | `x/sync` v0.24.0 | thuộc `golang.org/x` | Gộp lời gọi trùng key trong một process |
| `github.com/maypok86/otter/v2` | v2.4.0 (19/10/2026) | đang phát triển tích cực | Local cache in-process, TTL, giới hạn kích thước |
| `github.com/dgraph-io/ristretto/v2` | v2.4.2 (07/07/2026) | còn release | Chỉ tra release, không chạy trong lab. Lựa chọn thay thế cho otter (admission policy TinyLFU) |
| `ioredis` (Node) | 6.0.0 | không bị deprecate | Client phổ biến nhất của Node, hỗ trợ Cluster/Sentinel |
| `redis` (node-redis, Node) | 6.3.1 | không bị deprecate | Client chính thức của Redis |
| `iovalkey` (Node) | 0.4.0 | không bị deprecate | Bản fork của ioredis cho Valkey; phiên bản còn thấp |
| `@valkey/valkey-glide` (Node) | 2.5.3 | không bị deprecate | Client của dự án Valkey, lõi viết bằng Rust |

Việc chọn:
- **Go: `valkey-go`.** Lý do: lab chạy trên Valkey, API builder bắt lỗi tên lệnh lúc compile, và vì chung giao thức RESP nên cùng code chạy với Redis. `go-redis` là lựa chọn hoàn toàn hợp lệ nếu team đã quen; các pattern dưới đây (SET NX PX, Lua, JSON value) chuyển sang go-redis gần như một-một. Trong lab này chỉ chạy `valkey-go` với Valkey 9.1.3; chưa chạy với Redis.
- **Node: `ioredis`**, vì phổ biến và API ngắn gọn (`set(k, v, "PX", ms, "NX")`). `node-redis` cũng tốt; `iovalkey` đáng cân nhắc nếu muốn client do cộng đồng Valkey duy trì.
- **Local cache: `otter`** (API generic, đơn giản). Ristretto vẫn được maintain, nhưng admission policy của nó có thể từ chối ghi mục mới, nên khó dự đoán hơn trong ví dụ nhỏ.

## 3. Cache-aside with pgx and singleflight (Go)

Nguồn: `lab/go/repo.go`. Đây là cache-aside của chương 4, thêm `singleflight` để các request cùng key trong process chỉ nạp một lần:

```go
func (r *ProductRepo) Find(ctx context.Context, id int) (string, error) {
	key := "product:" + strconv.Itoa(id)
	if v, ok, err := r.Cache.Get(ctx, key); err != nil {
		return "", err
	} else if ok {
		r.Hits.Add(1)
		return v, nil
	}
	r.Miss.Add(1)
	v, err, _ := r.group.Do(key, func() (any, error) {
		s, err := r.DB.Load(ctx, id, "repo")
		if err != nil {
			return "", err
		}
		return s, r.Cache.SetEX(ctx, key, s, 60*time.Second)
	})
	s, _ := v.(string)
	return s, err
}

// UpdatePrice writes the DB in a transaction, then deletes the key AFTER commit.
func (r *ProductRepo) UpdatePrice(ctx context.Context, id int, price string) error {
	err := pgx.BeginFunc(ctx, r.DB.Pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE products SET price=$1, updated_at=now() WHERE id=$2`, price, id)
		return err
	})
	if err != nil {
		return err
	}
	return r.Cache.Del(ctx, "product:"+strconv.Itoa(id))
}
```

`DEL` nằm **sau** khi `BeginFunc` trả về (transaction đã commit). Xóa key khi transaction chưa commit cho phép request khác nạp lại giá trị cũ vào cache.

Chạy lại kịch bản shell của chương 6 (`lab/go`, lệnh `lab repo`: 200 lần đọc trên 10 sản phẩm, TTL 60 giây): `hit=190 miss=10 db_queries=10`; sau `UpdatePrice(3, "99")` và đọc lại: `Book 3|99.00 db_queries=11`. Trùng từng số với bản shell.

Hàm nạp `DB.Load` (`lab/go/cache.go`) dùng một CTE ghi vào `query_log` rồi `pg_sleep`, đúng như hàm `dbq` của shell, nên `SELECT count(*) FROM query_log` là số query thật phía PostgreSQL.

### Three things to remember when using singleflight

- **Context của người đến đầu tiên chi phối tất cả.** Nếu request đầu bị hủy (`ctx` cancel), các request đang đợi cùng nhận lỗi. Với tải thật, nạp bằng `context.WithoutCancel(ctx)` kèm timeout riêng, hoặc dùng `DoChan` để mỗi người đợi tự `select` trên `ctx` của mình.
- **Lỗi cũng được chia sẻ.** Một lần nạp lỗi làm hỏng mọi người đợi trong lần đó; gọi `Forget(key)` nếu muốn lần sau thử lại ngay.
- **Chỉ trong một process.** N instance của service vẫn nạp N lần (kết quả đo ở mục 8).

## 4. XFetch (Go)

Nguồn: `lab/go/cache.go`. Value lưu `{v, delta, expiry}`; TTL vật lý dài hơn expiry logic 5 giây.

```go
type xentry struct {
	V      string  `json:"v"`
	Delta  float64 `json:"delta"`  // seconds the last recompute took
	Expiry float64 `json:"expiry"` // logical expiry, unix seconds
}

func unixf(t time.Time) float64 { return float64(t.UnixNano()) / 1e9 }

// XFetch returns the value and whether this call recomputed it.
func (c *Cache) XFetch(ctx context.Context, key string, ttl time.Duration, beta float64,
	recompute func(context.Context) (string, error)) (string, bool, error) {
	if raw, ok, err := c.Get(ctx, key); err != nil {
		return "", false, err
	} else if ok {
		var e xentry
		if json.Unmarshal([]byte(raw), &e) == nil {
			r := 1 - mrand.Float64() // (0,1], so -ln(r) >= 0
			if unixf(time.Now())-e.Delta*beta*math.Log(r) < e.Expiry {
				return e.V, false, nil
			}
		}
	}
	t0 := time.Now()
	v, err := recompute(ctx)
	if err != nil {
		return "", true, err
	}
	e := xentry{V: v, Delta: time.Since(t0).Seconds(), Expiry: unixf(time.Now().Add(ttl))}
	b, _ := json.Marshal(e)
	// physical TTL a bit longer than the logical expiry
	return v, true, c.SetEX(ctx, key, string(b), ttl+5*time.Second)
}
```

`math/rand/v2.Float64()` trả về giá trị trong `[0,1)`, nên dùng `1 - Float64()` để được `(0,1]` và `math.Log` không bao giờ nhận 0.

## 5. A distributed lock with `SET NX PX` (Go)

Nguồn: `lab/go/cache.go`. Token ngẫu nhiên 16 byte; release bằng Lua để so token và xóa atomic:

```go
// Works on both Valkey and Redis. On Valkey >= 9.0 `DELIFEQ key token` does the same.
var unlockScript = valkey.NewLuaScript(
	`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`)

func (c *Cache) TryLock(ctx context.Context, key string, ttl time.Duration) (token string, ok bool, err error) {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token = hex.EncodeToString(b)
	err = c.C.Do(ctx, c.C.B().Set().Key(key).Value(token).Nx().PxMilliseconds(ttl.Milliseconds()).Build()).Error()
	if valkey.IsValkeyNil(err) {
		return "", false, nil // somebody else holds it
	}
	return token, err == nil, err
}

// Unlock deletes the lock only when we still own it. Returns true if deleted.
func (c *Cache) Unlock(ctx context.Context, key, token string) (bool, error) {
	n, err := unlockScript.Exec(ctx, c.C, []string{key}, []string{token}).AsInt64()
	return n == 1, err
}
```

`SET ... NX` thất bại trả về null, `valkey-go` biểu thị bằng lỗi mà `valkey.IsValkeyNil` nhận ra; ta đổi thành `ok=false`. Valkey từ 9.0 có lệnh `DELIFEQ key token` thay được script Lua (theo trang lệnh của valkey.io; lab này vẫn dùng Lua để cùng code chạy được trên Redis, nơi chương 9 ghi `DELIFEQ` báo `unknown command`).

Cách dùng để chống stampede, nguồn `lab/go/loaders.go`: người lấy được lock kiểm lại cache rồi mới nạp (double-check), người không lấy được thì poll cache mỗi 20 ms, tối đa 3 giây:

```go
func (l *Loader) withLock(ctx context.Context, key string) (string, error) {
	lk := "lock:" + key
	tok, ok, err := l.Cache.TryLock(ctx, lk, 5*time.Second)
	if err != nil {
		return "", err
	}
	if ok {
		defer l.Cache.Unlock(ctx, lk, tok)
		if v, hit, _ := l.Cache.Get(ctx, key); hit { // double-check after taking the lock
			return v, nil
		}
		return l.loadAndSet(ctx, key)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
		if v, hit, _ := l.Cache.Get(ctx, key); hit {
			return v, nil
		}
	}
	return "", fmt.Errorf("timed out waiting for %s", lk)
}
```

Kết hợp hai tầng (chương 6, mục 3.3): `singleflight` trong process để chỉ một goroutine mỗi process đi tranh lock, lock phân tán để chỉ một process nạp.

```go
case "both": // singleflight inside the process, lock across processes
	v, err, _ := l.Group.Do(key, func() (any, error) { return l.withLock(ctx, key) })
```

Lock này là lease có TTL, cùng giới hạn như chương 9: tốt cho cache (nạp trùng một lần là chấp nhận được), không đủ cho correctness tuyệt đối.

## 6. In-process local cache (L1) with otter

Nguồn: `runL1` trong `lab/go/main.go`. L1 với TTL 2 giây đứng trước Valkey:

```go
l1 := otter.Must(&otter.Options[string, string]{
	MaximumSize:      10_000,
	ExpiryCalculator: otter.ExpiryWriting[string, string](2 * time.Second),
})
read := func() string {
	if v, ok := l1.GetIfPresent("cfg:site"); ok {
		return v
	}
	v, _, err := c.Get(ctx, "cfg:site")
	must(err)
	l2++
	l1.Set("cfg:site", v)
	return v
}
```

Kết quả chạy thật: 1.000 lần đọc đầu chỉ tạo **1** lệnh `GET` tới Valkey; sau khi L1 hết hạn (2 giây), 1.000 lần đọc nữa chỉ thêm 1 lệnh (tổng 2). Đổi lại, mỗi instance có thể lệch tối đa bằng TTL của L1 (chương 1). Otter v2 còn có API nạp theo key (`Get` với loader) tự gộp các lần nạp đồng thời; trong cuốn này chưa chạy nên không dùng.

## 7. Node.js: client, coalescing, and stale-while-revalidate

Nguồn: `lab/node/src/`. Chạy trên Node 26 (LTS "Lithium", 26.13.0) với TypeScript 7.0.2; Node chạy thẳng file `.ts` (type stripping), còn `tsc --noEmit` dùng để kiểm kiểu.

**Request coalescing bằng Promise map** (`coalesce.ts`): các caller cùng key dùng chung một Promise đang chạy. Vì JavaScript đơn luồng, không cần lock nội bộ; tương đương `singleflight`:

```ts
export class Coalescer<T> {
  #inflight = new Map<string, Promise<T>>();

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => this.#inflight.delete(key));
    this.#inflight.set(key, p);
    return p;
  }
}
```

**Lock** (`lock.ts`) giống bản Go: `redis.set(key, token, "PX", ttlMs, "NX")` trả `"OK"` hoặc `null`; release bằng `redis.eval` chạy cùng script Lua.

**Stale-while-revalidate tự cài** (`swr.ts`). Entry lưu `{v, freshUntil}`, TTL vật lý bằng `fresh + stale`:

```ts
async get(key: string, loader: () => Promise<T>): Promise<T> {
  const raw = await this.redis.get(key);
  if (raw !== null) {
    const e = JSON.parse(raw) as Entry<T>;
    if (Date.now() >= e.freshUntil) void this.#refresh(key, loader).catch(() => {}); // stale: answer now, refresh later
    return e.v;
  }
  return this.#co.run(key, () => this.#load(key, loader)); // hard miss: callers wait
}
```

`#refresh` lấy lock `SET NX PX` (một người làm mới trên mọi process), rồi chạy loader qua `Coalescer` (một lần trong process) và `unlock`. Người gặp entry stale trả về ngay giá trị cũ; chỉ khi key hết hẳn (quá `fresh + stale`) caller mới phải chờ.

**Chạy thật** (`lab/node/run.sh`, ioredis 6.0.0, Valkey 9.1.3, `tsc --noEmit` không lỗi). Loader ở đây là **loader giả** đếm số lần gọi và ngủ 200 ms, không phải PostgreSQL thật:

```
naive    : 100 concurrent misses -> db calls = 100
coalesced: 100 concurrent misses -> db calls = 1
swr: 10 reads over ~1314ms, per-read latency = 204ms 2ms 4ms 22ms 2ms 4ms 2ms 1ms 13ms 2ms, db calls = 3
```

Ở demo SWR (`fresh` 300 ms, `stale` 2.000 ms, đọc mỗi 100 ms): chỉ lần đọc đầu (hard miss) phải chờ 204 ms; hai lần làm mới sau đó chạy nền và không đọc nào bị chặn (độ trễ tối đa của các lần đọc còn lại là 22 ms).

## 8. Real run results: stampede in Go

Chương trình `lab/go` mô phỏng đúng kịch bản chương 6: key `product:42` vừa hết hạn, **100 goroutine** cùng đọc tại một thời điểm (chờ chung một mốc `start`), mỗi lần nạp là query `pg_sleep(0.2)` có ghi `query_log`; số query lấy từ `SELECT count(*) FROM query_log` của PostgreSQL 18. Mỗi cấu hình chạy **3 lần**; "5 process" nghĩa là 5 process Go, mỗi process 20 goroutine, cùng chờ một mốc thời gian.

| Cấu hình | Process x goroutine | Query DB thật (3 lần) |
|---|---|---|
| Không bảo vệ (`naive`) | 1 x 100 | 100, 100, 100 |
| `singleflight` | 1 x 100 | 1, 1, 1 |
| Không bảo vệ | 5 x 20 | 100, 100, 100 |
| `singleflight` | 5 x 20 | 5, 5, 5 |
| Distributed lock (`SET NX PX`) | 5 x 20 | 1, 1, 1 |
| `singleflight` + lock | 5 x 20 | 1, 1, 1 |

Đặt cạnh số liệu shell (chương 6, mục 2): bản shell `naive` ra 26, 51, 83 vì 100 process `psql` khởi động lệch nhau hàng trăm ms trong container nhỏ nên một số client kịp thấy key đã được ghi. Goroutine thì khởi động cách nhau micro giây sau mốc `start`, nên **cả 100** đều thấy miss trước khi người nạp đầu tiên ghi xong (200 ms): đây là stampede ở dạng "sạch", 100 trên 100. Bản lock của shell ra 1, 2, 1 (lần 2 lock hết hạn vì máy bận); bản Go ra 1, 1, 1.

Độ trễ phía client (một lần chạy riêng, p50 / max): `naive` 1 process 429 / 554 ms (100 query tranh nhau pool và `pg_sleep` trên PostgreSQL); `singleflight` 214 / 215 ms (một query, mọi người đợi chung); lock 5 process khoảng 281 đến 290 ms p50 (người chờ phát hiện key mới sau chu kỳ poll 20 ms cộng thời gian nạp). Đây là một lần chạy, không phải benchmark.

Kết luận:
- `singleflight` đưa 100 xuống 1 **trong một process** nhưng với 5 process vẫn là 5: mỗi process có `Group` riêng.
- Lock phân tán đưa về 1 bất kể số process, đổi lại người chờ phải poll.
- Kết hợp cả hai cũng ra 1 và giảm số lần tranh lock từ 100 xuống 5 (mỗi process chỉ một goroutine đi lấy lock).

**XFetch so với TTL thường** (`lab/go`, `lab/go/demo.sh`: 50 goroutine đọc liên tục mỗi 10 ms trong 20 giây, TTL logic 3 giây, query nạp 0,2 giây, `beta` = 1, một lần chạy mỗi mode):

| Mode | Lượt đọc | Query DB thật | Lượt đọc phải chờ nạp |
|---|---|---|---|
| TTL thường | 53.128 | 300 | 300 |
| XFetch | 48.478 | 97 | 97 |

Mỗi lần key hết hạn, TTL thường làm khoảng 43 goroutine cùng nạp (300 query trên khoảng 7 chu kỳ); XFetch giảm còn khoảng 14 mỗi chu kỳ nhưng **không về 1**, vì không có lock nên nhiều goroutine có thể cùng bốc trúng xác suất làm mới sớm. Muốn đúng một lần nạp thì ghép XFetch với `singleflight` hoặc lock.

**Local cache (L1)** và **cache-aside** đã nêu ở mục 3 và 6: `hit=190 miss=10`, 10 query, sau update là 11; L1 gom 1.000 lần đọc thành 1 lệnh `GET`.

Cách chạy lại:

```
cd lab && docker compose -p bookcheck-cache up -d
docker exec bookcheck-cache-client sh -c 'psql -q -f /lab/schema.sql'
docker exec bookcheck-cache-go sh /app/bench.sh     # 6 cấu hình x 3 lần
docker exec bookcheck-cache-go sh /app/demo.sh      # repo, L1, XFetch
docker exec bookcheck-cache-node sh /app/run.sh     # Node: tsc + demo
```

## 9. Pitfalls

- Gọi `DEL` trước khi transaction commit: request khác nạp lại giá trị cũ.
- `singleflight` dùng `ctx` của người đầu tiên: hủy một request làm lỗi cả nhóm.
- `singleflight` một mình không đủ khi có nhiều instance.
- Lock phân tán có TTL ngắn hơn thời gian nạp (xem chương 9) hoặc release bằng `DEL` mù.
- Vòng chờ lock không có giới hạn thời gian.
- Local cache không có TTL hoặc giới hạn kích thước: dữ liệu cũ vô hạn, hoặc rò bộ nhớ.
- Lưu struct bằng định dạng gắn với một phiên bản code (gob): đổi struct làm hỏng cache cũ. Dùng JSON kèm trường version.
- Promise map không xóa entry khi loader lỗi: dùng `finally` như ví dụ để entry luôn được dọn.

## 10. Summary

- Go: `valkey-go` (hoặc `go-redis`) + `pgx` + `singleflight` là bộ tối thiểu cho cache-aside chống stampede trong một process.
- Nhiều process cần thêm lock `SET NX PX` có token và release bằng Lua (hoặc `DELIFEQ` trên Valkey 9+); kết hợp `singleflight` + lock cho số query DB thấp nhất.
- XFetch không cần lock; SWR cho người dùng không phải chờ; L1 (otter) giảm tải Valkey đổi lấy độ lệch tối đa bằng TTL của L1.
- Node: Promise map thay `singleflight`; SWR và lock tự cài trên `ioredis`.

## 11. Self-check questions

1. Vì sao `singleflight` một mình chưa đủ khi service chạy 5 instance?
2. Vì sao `DEL` cache phải đặt sau khi transaction commit?
3. Nếu người đến đầu tiên trong `singleflight.Do` bị hủy context thì điều gì xảy ra với những người đợi?
4. Vì sao Node không cần mutex khi cài Promise map?
5. Khi nào lock `SET NX PX` là chưa đủ?

<details><summary>Answer</summary>

1. Mỗi process có `Group` riêng, nên mỗi instance vẫn nạp một lần: 5 instance là 5 query (đo được ở mục 8).
2. Nếu xóa trước commit, request khác có thể đọc giá trị cũ từ DB và ghi lại vào cache sau khi ta xóa.
3. Tất cả nhận cùng lỗi; nên nạp bằng context tách riêng (`context.WithoutCancel` kèm timeout) hoặc dùng `DoChan`.
4. Event loop đơn luồng: kiểm tra `Map.get` và `Map.set` nằm trong cùng một lượt đồng bộ, không bị xen vào.
5. Khi cần correctness tuyệt đối (lease có thể hết hạn giữa chừng): cần fencing token hoặc constraint ở DB đích.

</details>
