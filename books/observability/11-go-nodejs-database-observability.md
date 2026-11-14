# Chương 11. Observability cho service Go và Node.js và database

> Tên file giữ nguyên (`11-go-nodejs-database-observability.md`) để không vỡ link; nội dung đã viết lại cho Go và Node.js. Bản trước của chương nói về PHP/Laravel.

## 1. Tình huống

Service `orders` viết bằng Go, một service khác viết bằng Node.js, cả hai dùng PostgreSQL. Người dùng kêu trang danh sách đơn chậm. Trên production bạn không biết: request nào chậm, có phải query N+1 không, có phải hết connection trong pool không, event loop của Node có bị chặn không, hay một câu SQL thiếu index. Go và Node.js là runtime chạy lâu (một process phục vụ rất nhiều request), nên khác với mô hình "mỗi request một process": metric in-memory sống được, nhưng phát sinh câu hỏi mới về goroutine, GC, heap và event loop.

## 2. Khái niệm

### Đặc thù của runtime chạy lâu

- **Metric in-memory sống qua request**: SDK export **cumulative** theo chu kỳ (lab: 5 giây) qua một goroutine nền; không cần delta, không cần `delta_to_cumulative` ở Collector.
- **Một process, nhiều request đồng thời**: Go dùng goroutine, Node dùng một event loop. Cần đo saturation riêng của runtime (số goroutine, GC pause, event loop delay) chứ không chỉ CPU của container.
- **Tắt service phải flush**: gọi `Shutdown` của TracerProvider và MeterProvider khi nhận SIGTERM, nếu không span và metric cuối cùng có thể mất.
- **Pool connection là resource cần đo**: `database/sql` (Go) và `pg.Pool` (Node) đều có số connection tối đa; hết connection nghĩa là request xếp hàng.

### Instrument service Go

Code đầy đủ ở `lab/app/main.go` (chương 12); đã chạy thật. Ba lớp:

1. **`otelhttp`** (`go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp`, v0.72.0 trong lab): bọc `http.Handler` để có span SERVER và metric `http.server.request.duration`; bọc `http.RoundTripper` bằng `otelhttp.NewTransport` để có span CLIENT và tự chèn `traceparent`.

   ```go
   handler := otelhttp.NewHandler(mux, "server", otelhttp.WithSpanNameFormatter(
       func(_ string, r *http.Request) string { return r.Method + " " + r.URL.Path }))
   client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
   ```

2. **Database**: hai lựa chọn phổ biến, **chưa chạy trong lab này** (theo README của từng dự án khi kiểm tra 11/2026):
   - `github.com/exaring/otelpgx`: tracer cho `pgx` v5 (yêu cầu pgx v5 và Go 1.25+), gắn vào config của pool: `cfg.ConnConfig.Tracer = otelpgx.NewTracer()`; `otelpgx.RecordStats(pool)` ghi thống kê pool.
   - `github.com/XSAM/otelsql`: bọc `database/sql`: `db, err := otelsql.Open("postgres", dsn, ...)`; `otelsql.RegisterDBStatsMetrics(db, ...)` xuất `sql.DBStats` thành metric; có metric `db.client.operation.duration`. README ghi dự án được host độc lập (chưa nằm trong contrib) và **không cam kết tương thích** ngoài các phiên bản Go đã test (Go 1.26, 1.27).

   Chọn theo driver bạn đang dùng: `pgx` trực tiếp thì `otelpgx`; `database/sql` (kể cả `pgx/stdlib`) thì `otelsql`. Cả hai đều có thể ghi câu SQL vào span; xem phần cảnh báo `db.query.text` bên dưới.
3. **Manual**: thêm span nghiệp vụ và attribute (lab: span `SELECT stock` với `db.system.name` và `db.operation.name`, `RecordError`, `SetStatus`).

Log có `trace_id` bằng `slog` đã mô tả ở chương 4 và 12: handler bọc `slog.NewJSONHandler`, lấy `trace.SpanContextFromContext(ctx)`; luôn dùng các hàm `...Context`.

### Instrument service Node.js

Trạng thái khi kiểm tra (11/2026), theo docs OTel: **Traces và Metrics là Stable, Logs ở mức Development** cho JavaScript; SDK hỗ trợ các bản LTS active và maintenance của Node.js. Node.js hiện có các dòng LTS 26 (Lithium), 24 (Krypton) và 22 (Jod). Các package trên npm khi kiểm tra: `@opentelemetry/sdk-node` 0.301.0, `@opentelemetry/auto-instrumentations-node` 0.83.0, `@opentelemetry/instrumentation-pg` 0.78.0; hai package đầu yêu cầu Node.js >= 22.15.0. Số `0.x` là số của nhóm package experimental, không có nghĩa là bản thử: hãy đọc README từng instrumentation để biết mức stability.

**Zero-code (auto-instrumentation)** theo docs OTel (chưa chạy trong lab này):

```bash
npm install --save @opentelemetry/api @opentelemetry/auto-instrumentations-node
export OTEL_SERVICE_NAME=inventory-svc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
node app.js
```

Gói này bật nhiều instrumentation cùng lúc (HTTP, Express, `undici`/fetch, `pg`...). Docs chuyển phần ESM và `OTEL_NODE_ENABLED_INSTRUMENTATIONS` sang trang cấu hình riêng; hãy đọc trang đó nếu app dùng ESM (`type: module`), vì cách nạp hook cho ESM khác CommonJS. Trade-off: tiện, nhưng sinh nhiều span (kể cả những span bạn không cần), nên giới hạn bằng `OTEL_NODE_ENABLED_INSTRUMENTATIONS` và sampling.

**Manual** vẫn cần cho span nghiệp vụ: `trace.getTracer(...).startActiveSpan(...)` từ `@opentelemetry/api`. Log JSON có `trace_id` ở Node nên lấy từ `trace.getActiveSpan()?.spanContext()` (logger như pino hoặc winston đều chèn được); chưa chạy thử trong lab.

### Runtime metrics

| Runtime | Metric cần theo dõi | Cách lấy |
|---|---|---|
| Go | số goroutine, heap, GC | `go.opentelemetry.io/contrib/instrumentation/runtime` (v0.72.0), gọi `runtime.Start()`. **Đã chạy**: Prometheus trả `go_goroutine_count` = 28 cho cả hai service (chương 12) |
| Node.js | event loop delay, event loop utilization, heap | `node:perf_hooks` (`monitorEventLoopDelay`, `performance.eventLoopUtilization`), hoặc `@opentelemetry/instrumentation-runtime-node` (0.38.0, mô tả: "Node.js Performance measurement API"; tôi chưa kiểm tên metric cụ thể) |

Event loop delay là chỉ số saturation quan trọng nhất của Node: một handler chạy CPU lâu làm **mọi** request khác chờ. Mã dưới đây (`lab/node/eventloop.mjs`, không cần dependency) chặn event loop 5 lần, mỗi lần 200 ms, và đo:

```js
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 10 }); // sample every 10 ms
h.enable();
const elu0 = performance.eventLoopUtilization();
// ... 5 lần busy loop 200 ms ...
console.log(`eventloop delay: mean=${ms(h.mean)}ms p99=${ms(h.percentile(99))}ms max=${ms(h.max)}ms`);
console.log(`eventloop utilization=${performance.eventLoopUtilization(elu0).utilization.toFixed(2)}`);
```

Kết quả thật (container `node:26-alpine`, Node v26.13.0): `mean=22.8ms p99=210.0ms max=210.5ms`, `eventloop utilization=0.56`. Mean thấp nhưng p99 và max ≈ 210 ms phản ánh đúng khối chặn 200 ms: cũng như latency, hãy xem percentile chứ không chỉ mean. Giá trị `h.mean` và `h.percentile()` tính bằng nanosecond.

Trong Go không có "event loop"; bản tương đương là số goroutine tăng đều (leak), thời gian GC, và hàng đợi chờ connection của pool.

### Quan sát database

**Ba lớp**: (1) từ ứng dụng: span query (`db.system.name`, `db.operation.name`; cẩn thận `db.query.text` có thể chứa dữ liệu nhạy cảm, nên dùng bản đã tham số hóa); (2) từ chính DB: slow query log, bảng thống kê; (3) từ metric hạ tầng DB (connection, replication lag, cache hit, checkpoint) qua exporter.

#### PostgreSQL

- **Slow query log**: `log_min_duration_statement = 250` (ms; `0` = log tất cả, `-1` = tắt). Đã kiểm chứng trong một container tạm PostgreSQL 18.6: câu `CREATE TABLE ... INSERT` chạy 1008 ms xuất hiện trong log dạng `LOG:  duration: 1008.363 ms  statement: ...`. Kết hợp `log_lock_waits = on` để thấy lock wait.
- **`pg_stat_statements`**: thống kê theo câu lệnh đã chuẩn hóa (hằng số thành `$1`). Bật bằng `shared_preload_libraries = 'pg_stat_statements'` (cần **khởi động lại** server), `compute_query_id = on` (hoặc `auto`), rồi `CREATE EXTENSION pg_stat_statements;` trong từng database cần xem. Tham số: `pg_stat_statements.max` (mặc định 5000), `pg_stat_statements.track` (`top` mặc định, `all` gồm cả câu lồng trong hàm).

  Các cột hay dùng (theo tài liệu PostgreSQL 18): `calls`, `total_exec_time`, `mean_exec_time`, `max_exec_time`, `rows`, `shared_blks_hit`, `shared_blks_read`, `temp_blks_written`; `queryid` là hash của câu đã chuẩn hóa.

  Kết quả thật từ container thử (300.000 dòng, chưa có index; lần chạy này thuộc bản đầu của sách, không chạy lại khi chuyển sang Go vì phần này không phụ thuộc ngôn ngữ):

  ```text
   calls | total_ms | mean_ms |  rows  | query
       5 |    208.0 |   41.59 |      5 | SELECT qty FROM stock WHERE sku = $1
       1 |    106.8 |  106.79 |      1 | SELECT count(*) FROM stock WHERE qty > $1
  ```

  Query "tốn nhất" theo tổng thời gian (không phải theo lần chậm nhất):

  ```sql
  SELECT calls, round(total_exec_time::numeric,1) AS total_ms,
         round(mean_exec_time::numeric,2) AS mean_ms, rows, left(query,80) AS query
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC LIMIT 10;
  ```

  Sau khi `CREATE INDEX ON stock(sku)`, `EXPLAIN (ANALYZE, BUFFERS)` cho câu tương tự dùng `Bitmap Index Scan` và chạy dưới 1 ms. `pg_stat_statements_reset()` xóa thống kê (cần quyền cao); nên đặt mốc trước và sau thay đổi để so sánh.
- **`auto_explain`**: tự ghi kế hoạch của câu vượt threshold (`auto_explain.log_min_duration`), dùng thận trọng vì có overhead.
- Đẩy metric ra Prometheus bằng `postgres_exporter` (dự án cộng đồng prometheus-community); tôi chưa chạy trong lab này.

#### MySQL (khác biệt)

- Slow query log: `slow_query_log = ON`, `long_query_time = 0.5` (giây, không phải ms như PostgreSQL), tùy chọn `log_queries_not_using_indexes`. Phân tích bằng `mysqldumpslow` hoặc `pt-query-digest` (Percona Toolkit).
- Thống kê tương đương `pg_stat_statements`: `performance_schema.events_statements_summary_by_digest`.
- Chưa chạy thử MySQL trong lab này.

#### Từ phía ứng dụng Go và Node.js

- **Go**: `db.Stats()` (`database/sql`) trả về `OpenConnections`, `InUse`, `WaitCount`, `WaitDuration`; `WaitCount` tăng nghĩa là request đang chờ connection. `otelsql.RegisterDBStatsMetrics` và `otelpgx.RecordStats` xuất các số này thành metric.
- **Node.js**: `pg.Pool` có `totalCount`, `idleCount`, `waitingCount`; `waitingCount > 0` kéo dài là dấu hiệu pool nhỏ hoặc query chậm.
- **N+1**: ORM hay vòng lặp gọi query từng dòng. Ghi số query mỗi request thành attribute của span gốc, hoặc nhìn trace thấy cùng một span DB lặp hàng chục lần.

## 3. Ví dụ: quy trình điều tra "trang đơn hàng chậm"

```text
1. Metric: p95 của endpoint GET /orders tăng (dashboard RED theo endpoint)
2. Trace chậm: span DB "SELECT ... FROM orders ..." lặp 120 lần trong một request (N+1)
3. pg_stat_statements: câu đó có calls rất lớn, mean_exec_time nhỏ nhưng total_exec_time lớn
4. Runtime: pool wait (WaitCount, waitingCount) tăng; với Node, event loop delay p99 tăng
5. Sửa: gộp thành một query (JOIN hoặc WHERE id = ANY($1)); thêm index nếu EXPLAIN cho thấy Seq Scan
6. So sánh: reset hoặc đánh mốc pg_stat_statements, deploy, đo lại p95 và calls
```

## 4. Trade-off

- `log_min_duration_statement` thấp giúp thấy nhiều nhưng làm đầy log và tăng I/O; chọn threshold gần SLO của query, hoặc sampling (`log_statement_sample_rate`) khi cần.
- `pg_stat_statements` rất rẻ so với lợi ích nhưng chỉ có thống kê tổng hợp, không có từng lần gọi; kết hợp với trace.
- `pg_stat_statements.track = all` và `track_planning = on` thêm chi phí (tài liệu nêu rõ cho `track_planning`); bật khi cần.
- Instrument DB tự động (`otelpgx`, `otelsql`, `instrumentation-pg`) tiện nhưng sinh nhiều span; cân nhắc sampling hoặc tắt span cho query quá ngắn. `otelsql` chưa có cam kết ổn định như contrib.
- Auto-instrumentation Node bật nhiều thứ cùng lúc: giới hạn bằng biến môi trường để kiểm soát số span.

## 5. Cạm bẫy

- Quên khởi động lại PostgreSQL sau khi thêm `shared_preload_libraries` rồi `CREATE EXTENSION` báo lỗi hoặc view trống; quên `compute_query_id`.
- Ghi `db.query.text` có giá trị thật (email, token) vào span/log.
- Đọc `pg_stat_statements` theo lần chậm nhất (`max_exec_time`) thay vì tổng thời gian khi tìm thứ tải nặng nhất.
- Pool lớn hơn số connection DB cho phép (cộng tất cả instance): lỗi "too many connections" vào giờ cao điểm.
- Go: quên `ctx` trong `slog` và trong lời gọi DB/HTTP: mất `trace_id` và span con bị đứt khỏi trace; quên `Shutdown` khi tắt service.
- Node.js: đọc event loop delay bằng `mean` thay vì `p99`/`max`; chạy tác vụ CPU nặng trong handler.
- Đọc nhãn Prometheus của metric từ SDK mà quên `service.name` thành `exported_job` (chương 12).
- `long_query_time` MySQL tính bằng giây, `log_min_duration_statement` PostgreSQL bằng mili giây; nhầm đơn vị.

## 6. Tóm tắt

- Go và Node.js là runtime chạy lâu: metric cumulative qua SDK, nhớ flush khi tắt, đo saturation riêng của runtime (goroutine/GC, event loop delay).
- Go: `otelhttp` (đã chạy), `otelpgx` hoặc `otelsql` cho database (chưa chạy), `slog` + `trace_id`. Node.js: auto-instrumentation qua `NODE_OPTIONS` (chưa chạy), Traces/Metrics Stable còn Logs Development.
- PostgreSQL: `log_min_duration_statement` cho log chậm; `pg_stat_statements` (cần preload + restart + `compute_query_id` + `CREATE EXTENSION`) cho thống kê theo câu.
- Luôn nối tầng ứng dụng với tầng DB: từ span DB chậm sang `pg_stat_statements` và `EXPLAIN`.

## 7. Câu hỏi tự kiểm tra

1. Vì sao service Go không cần `delta_to_cumulative` còn bản PHP cần?
2. Các bước bật `pg_stat_statements` và bước nào cần restart?
3. Khác biệt đơn vị giữa `log_min_duration_statement` và `long_query_time`?
4. Vì sao phải nhìn p99 của event loop delay thay vì mean?
5. Chọn `otelpgx` hay `otelsql` trong trường hợp nào?

<details><summary>Đáp án</summary>

1. Process Go sống lâu nên SDK giữ được giá trị cộng dồn và export cumulative; PHP (mô hình mỗi request một process) chỉ export phần tăng (delta) nên bản PHP cũ cần Collector cộng dồn.
2. Thêm `shared_preload_libraries='pg_stat_statements'` và `compute_query_id=on`, restart server (bắt buộc), rồi `CREATE EXTENSION pg_stat_statements;` trong từng database.
3. PostgreSQL: mili giây; MySQL: giây.
4. Vài khối chặn ngắn làm mean thấp nhưng làm mọi request đang chờ bị trễ; trong thử nghiệm mean 22,8 ms trong khi p99 210 ms.
5. `otelpgx` khi dùng `pgx` v5 trực tiếp; `otelsql` khi dùng `database/sql` (kể cả `pgx/stdlib`).
</details>
