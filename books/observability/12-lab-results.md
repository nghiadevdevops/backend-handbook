# Chương 12. Lab: dựng stack và kiểm chứng bằng API

Mục tiêu: tự tay xác nhận rằng metric, trace và log **thật sự tới backend và khớp nhau**, không chỉ "app chạy không lỗi". Mọi kết quả dưới đây là kết quả chạy thật ngày 08/11/2026 trên Docker Desktop (WSL2), với hai service viết bằng **Go 1.27.3** và **OpenTelemetry Go SDK v1.47.0**. (Bản đầu của lab dùng PHP; các bài học của bản đó được rà lại ở mục 5.)

## 1. Kiến trúc lab

```
 curl (traffic) ──► orders (Go, :8080) ──► inventory (Go, :8080)
                       │  OTLP/HTTP              │  OTLP/HTTP
                       └──────────┬──────────────┘
                                  ▼
                        otel-collector (contrib 0.165.0)
                         ├─ traces ─► otlp_grpc ─► jaeger 2.23.0 (UI/API :16686)
                         │          └► span_metrics (connector) ─┐
                         └─ metrics ◄───────────────────────────┘
                              └─► prometheus exporter :8889 ◄── scrape ── prometheus v3.16.0
                                                                     └─ rules/slo-orders.yml
 pprof: orders và inventory mở thêm :6060 (chỉ trong network của lab)
```

| Service | Image | `mem_limit` |
|---|---|---|
| jaeger | `jaegertracing/jaeger:2.23.0` | 256m |
| otel-collector | `otel/opentelemetry-collector-contrib:0.165.0` | 256m |
| prometheus | `prom/prometheus:v3.16.0` (retention 2h) | 256m |
| orders, inventory | build từ `lab/app` (`golang:latest` = Go 1.27.3, chạy trên `distroless/static`) | 96m mỗi service |
| grafana (profile `grafana`, tắt mặc định) | `grafana/grafana:latest` | 384m |

Không service nào map port ra host. Tên container/network đều có tiền tố `bookcheck-obsgo-`. Đo bằng `docker stats` lúc chạy: collector ≈ 48 MiB, prometheus ≈ 49 MiB, jaeger ≈ 24 MiB, mỗi service Go ≈ 9 MiB (bản PHP ≈ 30 MiB mỗi service).

Thư viện (từ `lab/app/go.mod`): `go.opentelemetry.io/otel` và `sdk`, `sdk/metric`, `otlptracehttp`, `otlpmetrichttp` đều **v1.47.0**; `contrib/instrumentation/net/http/otelhttp` **v0.72.0**; `contrib/instrumentation/runtime` **v0.72.0**. Log dùng `log/slog` của thư viện chuẩn.

Các file: `lab/compose.yaml`, `lab/app/{go.mod,go.sum,Dockerfile,main.go}`, `lab/otel/collector.yaml`, `lab/prometheus/prometheus.yml`, `lab/rules/slo-orders.yml`, `lab/rules/tests/slo-orders.test.yml`, `lab/scripts/{traffic.sh,verify.sh,trace_by_id.sh}`.

## 2. Code Go (trích từ `lab/app/main.go`)

Khởi tạo SDK: exporter OTLP/HTTP tự đọc `OTEL_EXPORTER_OTLP_ENDPOINT`, resource đọc `OTEL_SERVICE_NAME`; metrics gửi **cumulative** (mặc định của SDK) mỗi 5 giây.

```go
res, _ := resource.New(ctx, resource.WithFromEnv(), resource.WithTelemetrySDK())
te, _ := otlptracehttp.New(ctx)
tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(te), sdktrace.WithResource(res))
me, _ := otlpmetrichttp.New(ctx)
mp := sdkmetric.NewMeterProvider(
    sdkmetric.WithReader(sdkmetric.NewPeriodicReader(me, sdkmetric.WithInterval(5*time.Second))),
    sdkmetric.WithResource(res))
otel.SetTracerProvider(tp)
otel.SetMeterProvider(mp)
otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
runtime.Start() // Go runtime metrics: goroutines, heap, GC
```

(Trong file thật mọi `error` đều được kiểm tra; ở đây rút gọn.) Server dùng `otelhttp.NewHandler` (tạo span SERVER và metric `http.server.request.duration`), client dùng `otelhttp.NewTransport` (tạo span CLIENT và chèn header `traceparent`). Log là `slog` JSON, thêm `trace_id`/`span_id` từ `context`:

```go
func (h traceHandler) Handle(ctx context.Context, r slog.Record) error {
    if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
        r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
    }
    return h.Handler.Handle(ctx, r)
}
```

Phải gọi `slog.ErrorContext(ctx, ...)` (có `ctx`) thì handler mới thấy span; `slog.Error(...)` không có `ctx` sẽ mất `trace_id`. Về bridge: trang docs OTel Go ghi Logs ở mức "Release candidate", nhưng CHANGELOG của `opentelemetry-go` ghi bản **1.47.0 (02/10/2026)** là bản stable đầu tiên của `otel/log` và `otel/sdk/log`. Bridge `contrib/bridges/otelslog` thì khi kiểm tra vẫn là module **v0** (v0.21.0), chưa stable, nên lab dùng log JSON có `trace_id` thay vì bridge. Đây là sự lệch giữa docs và changelog; hãy kiểm tra lại khi áp dụng.

## 3. Chạy lại

```bash
cd lab
docker compose up -d --build
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300   # đợt 2, xem lỗi #1
sleep 100     # chờ connector span_metrics flush và Prometheus scrape
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/verify.sh
docker logs bookcheck-obsgo-orders 2>&1 | grep '"level":"ERROR"' | tail -1      # lấy một trace_id
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/trace_by_id.sh <trace_id>
docker compose down -v
```

Gây lỗi khác: sửa `ERROR_RATE` hoặc `SLOW_RATE` trong `compose.yaml` rồi `docker compose up -d`. Sau khi sửa `otel/collector.yaml` phải `docker compose restart otel-collector`.

## 4. Kết quả xác nhận bằng API (từ container `curl` khác)

Hai đợt traffic, mỗi đợt 300 request: cả hai đợt đều cho 285 thành công và 15 lỗi (HTTP 502). Tổng **600 request: 570 thành công, 30 lỗi**.

| Kiểm tra | API | Kết quả |
|---|---|---|
| Target Prometheus | `GET /api/v1/query?query=up` | 2 target `up = 1` |
| Metric RED từ span | `sum by (status_code)(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"})` | `STATUS_CODE_UNSET = 570`, `STATUS_CODE_ERROR = 30`: **tổng 600, khớp số request gửi** |
| Metric tự đếm trong SDK Go | `sum by (outcome)(orders_processed_total)` | `accepted = 570`, `rejected = 30`: khớp từng loại |
| Metric tự sinh bởi `otelhttp` | `sum(http_server_request_duration_seconds_count)` | 1200 = 600 request ở orders + 600 ở inventory |
| Go runtime metric | `go_goroutine_count` | 28 goroutine ở mỗi service (có `otel_scope_name="go.opentelemetry.io/contrib/instrumentation/runtime"`) |
| Latency percentile | `histogram_quantile(0.95, ...duration_milliseconds_bucket...)` | 50 ms (cận trên bucket; chỉ ≈ 5% request chậm 400 ms, p95 nằm sát ranh giới nên đừng đọc con số này như giá trị chính xác) |
| Recording rule | `service:orders_error_ratio:rate5m` | 0,05 (5,0%) |
| Jaeger services | `GET /api/v3/services` | `["inventory-svc","orders-api","jaeger"]` |
| Trace mẫu | `GET /api/v3/traces?query.service_name=orders-api&...` | 1 trace gồm 4 span, thuộc **2 service**: `GET /order` (SERVER), `HTTP GET` (CLIENT), `GET /reserve` (SERVER), `SELECT stock` (CLIENT) |
| Trace lỗi | `query.attributes={"http.response.status_code":"502"}` | 3 trace trả về (`num_traces=3`) |
| Alert | `GET /api/v1/alerts` | `OrdersErrorBudgetBurnSlow` và `OrdersErrorBudgetBurnTicket` đang `firing`; `Fast` không có vì ngưỡng 7,2% cao hơn lỗi 5% |
| pprof | `GET http://orders:6060/debug/pprof/goroutine?debug=1` | `goroutine profile: total 11` |

**Log liên kết với trace**: với `trace_id` `d2e0b9dec2892c36e766df3a58a7c3f9`, `docker logs` của hai container cho hai dòng cùng ID:

```text
{"time":"2026-11-08T08:00:06.614868815Z","level":"ERROR","msg":"stock backend unavailable","service":"inventory-svc","trace_id":"d2e0b9dec2892c36e766df3a58a7c3f9","span_id":"4c951d5105b6c6a8"}
{"time":"2026-11-08T08:00:06.616103189Z","level":"ERROR","msg":"inventory failed (500)","service":"orders-api","trace_id":"d2e0b9dec2892c36e766df3a58a7c3f9","span_id":"7abb77ae4d93fe53"}
```

Gọi `GET /api/v3/traces/d2e0b9dec2892c36e766df3a58a7c3f9` (script `trace_by_id.sh`) trả về đúng 4 span của 2 service nói trên. Như vậy context propagation (W3C `traceparent`) hoạt động giữa hai service Go và log mang đúng trace ID.

Cũng trong lab, `go tool pprof -top http://orders:6060/debug/pprof/heap` (chạy trong container `golang`) lấy được heap profile: `inuse_space` khoảng 1,5 MB, đứng đầu là `runtime.mallocgc`. Con số này chỉ chứng minh endpoint pprof dùng được; service gần như rảnh nên không có điểm nóng nào để phân tích.

## 5. Kiểm tra rule bằng promtool (Docker, `prom/prometheus:v3.16.0`)

```bash
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 check rules /rules/slo-orders.yml
#  SUCCESS: 8 rules found
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 test rules /rules/tests/slo-orders.test.yml
#  SUCCESS
```

Rule và test không đổi so với bản PHP (SLI lấy từ metric `span_metrics`, không phụ thuộc ngôn ngữ). Bốn ca test mô tả ở chương 7 vẫn qua.

## 6. Lỗi gặp khi dựng lab bằng Go

| # | Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|---|
| 1 | Ngay sau đợt traffic đầu, `calls_total` bằng 0; khi đã có số thì `service:orders_error_ratio:rate5m` là `NaN` | Connector `span_metrics` flush theo chu kỳ (sau khoảng 20 giây vẫn 0, sau thêm khoảng 45 giây đã đủ 300). Series xuất hiện lần đầu đã ở giá trị 300 và đứng yên nên `rate()` bằng 0 và `0/0 = NaN` | Chờ 1 đến 2 phút; chạy **đợt traffic thứ hai** để counter tăng trong cửa sổ `rate()`. Sau đó ratio ra 0,05 |
| 2 | Query metric Go theo `job="orders-api"` trả rỗng; kết quả có `job="otel-collector"` và nhãn lạ `exported_job="orders-api"` | Prometheus scrape Collector nên `job` là của scrape config; `service.name` từ SDK bị đổi tên thành `exported_job` vì trùng nhãn (không bật `honor_labels`) | Lọc theo `exported_job` (hoặc bật `honor_labels: true`; tôi chưa thử cách này). `span_metrics` có nhãn `service_name` riêng nên không bị ảnh hưởng |
| 3 | Span CLIENT của orders tên `HTTP GET`, không mô tả được đích gọi | `otelhttp.NewTransport` mặc định đặt tên span là `HTTP <method>` | Nếu cần tên rõ hơn, thêm `otelhttp.WithSpanNameFormatter` vào transport (lab giữ mặc định; không ảnh hưởng số đếm) |
| 4 | Docs nói Logs của Go "Release candidate", CHANGELOG nói đã stable từ 1.47.0, bridge `otelslog` vẫn v0 | Docs lệch pha so với release | Đọc CHANGELOG và số phiên bản module trước khi quyết định; lab dùng `slog` JSON + `trace_id` |

Lưu ý: không có lỗi nào trong số này làm số đếm sai. Chúng là loại lỗi "đọc nhầm số" khi kiểm chứng, và lỗi #1, #2 chỉ lộ ra vì tôi đối chiếu với số request.

### Bài học của bản PHP cũ: còn đúng hay đã bỏ

| Bài học của bản PHP | Trạng thái |
|---|---|
| Collector 0.165.0 đổi tên component: dùng `otlp_grpc`, `span_metrics`, `delta_to_cumulative` | **Còn đúng** (cấu hình mới vẫn dùng `otlp_grpc/jaeger` và `span_metrics`; Collector không in warning nào khi khởi động lab Go). `delta_to_cumulative` không còn cần |
| `STDERR` không tồn tại trong SAPI cli-server; `curl_close()` deprecated làm hỏng mã HTTP | **Đã bỏ**: lỗi riêng của PHP. Ý tổng quát (kiểm tra mã trạng thái thật, không chỉ body) vẫn đúng và được `traffic.sh` kiểm bằng `%{http_code}` |
| Jaeger v2 dùng API `/api/v3/...`, cần `query.start_time_min/max` | **Còn đúng**, `verify.sh` vẫn dùng |
| `calls_total` thấp vì nhiều worker PHP có `process.pid` khác nhau, exporter Prometheus ghi đè stream | **Đã bỏ**: Go là một process nhiều goroutine, một resource duy nhất. Lab Go chạy **không** có `resource_metrics_key_attributes` hay `resource/strip_process` mà số đếm vẫn khớp (600/600) |
| `orders_processed_total` thấp cùng nguyên nhân, cần xóa `process.pid` | **Đã bỏ**, cùng lý do (570 + 30 = 600 khớp) |
| `delta` temporality + `delta_to_cumulative` vì PHP sống ngắn theo request | **Đã bỏ**: process Go sống lâu, SDK export cumulative mặc định |
| Connector flush theo chu kỳ nên metric có lúc bằng 0 | **Còn đúng** (lỗi #1 ở trên) |
| Mỗi request PHP mất 0,8 giây vì export đồng bộ cuối request | **Đã bỏ**: SDK Go dùng batch processor và periodic reader chạy nền |

Bài học tổng quát giữ nguyên: **luôn đối chiếu số metric với số request đã gửi**, và nhớ rằng lỗi hay nằm ở bước đọc (label, cửa sổ thời gian) chứ không chỉ ở bước ghi.

## 7. Giới hạn của lab (chưa kiểm chứng)

- Không chạy Grafana, Tempo, Alertmanager, Pyroscope, node_exporter, OTLP logs, bridge `otelslog`, `otelpgx`/`otelsql` và Node.js: các chương nói về chúng dựa trên tài liệu, đã ghi rõ.
- Chưa kiểm chứng việc mất dữ liệu khi service tắt mà không gọi `Shutdown`; code lab gọi `Shutdown` của hai provider khi nhận SIGTERM.
- Jaeger lưu in-memory, mất khi restart.
- Chỉ đo histogram cổ điển, chưa thử native histogram.
- Không đo thời gian hoàn thành traffic, nên chương này không đưa số liệu throughput.
- PostgreSQL `pg_stat_statements` được chạy thử ở container tạm ngoài compose trong lần viết đầu (chương 11); lần này không chạy lại.

## 8. Tóm tắt

- Xác nhận bằng API từ container khác cho thấy dữ liệu **thực sự** tới Prometheus và Jaeger, và số đếm khớp tuyệt đối với số request (600, 570 và 30).
- Trace đi qua 2 service Go; log của cả hai có cùng `trace_id` với trace trong Jaeger.
- Với Go, nhóm lỗi "nhiều worker ghi đè series" của PHP biến mất; thay vào đó lỗi nằm ở nhãn `exported_job`, độ trễ flush và cửa sổ `rate()`.
- Rule burn-rate được kiểm bằng `promtool test rules`; SLI từ `span_metrics` không đổi khi đổi ngôn ngữ.

## 9. Câu hỏi tự kiểm tra

1. Vì sao lab xác nhận từ một container `curl` khác thay vì xem log của app?
2. Vì sao `rate5m` ra `NaN` sau đợt traffic đầu tiên, và sửa thế nào?
3. Vì sao query metric của SDK Go theo `job="orders-api"` trả rỗng?
4. Vì sao bản Go không cần `delta_to_cumulative` và `resource/strip_process`?
5. Vì sao phải dùng `slog.ErrorContext(ctx, ...)` thay vì `slog.Error(...)`?

<details><summary>Đáp án</summary>

1. Log app chỉ chứng minh app đã gửi; gọi API backend chứng minh dữ liệu đã đi hết đường ống, qua mạng, và được lưu/query được.
2. Series span metrics xuất hiện lần đầu đã ở giá trị cuối và đứng yên, nên `rate()` bằng 0 và phép chia `0/0` ra `NaN`. Cần traffic liên tục để counter tăng trong cửa sổ; chạy thêm đợt thứ hai.
3. Prometheus dùng `job` của scrape config (`otel-collector`); `service.name` của SDK bị đổi thành nhãn `exported_job`. Lọc theo `exported_job` hoặc bật `honor_labels`.
4. Process Go sống lâu và export cumulative sẵn, và chỉ có một resource cho mỗi service, nên không có nhiều stream ghi đè nhau như nhiều worker PHP.
5. Handler lấy span hiện hành từ `context`; không truyền `ctx` thì không có span và log mất `trace_id`/`span_id`.
</details>
