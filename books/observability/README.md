# Observability và vận hành hệ thống production

> Bản học tiếng Việt, kiểm tra thực tế tháng 11/2026. Người đọc: developer backend đã học system design và muốn biết cách **quan sát** và **vận hành** một hệ thống thật.

## Ai nên đọc, cần biết gì

- Đã viết và deploy ít nhất một service backend (Go, TypeScript/Node.js, Java... đều được; ví dụ chính dùng Go, kèm phần cho Node.js).
- Biết HTTP, SQL, Docker cơ bản; đã nghe qua load balancer, cache, queue.
- Không cần biết trước Prometheus hay OpenTelemetry.

## Ví dụ xuyên suốt

Hệ thống đặt hàng nhỏ gồm hai service: **`orders-api`** (cổng vào, `GET /order`) gọi **`inventory-svc`** (`GET /reserve`, giả lập query DB, có error rate và chậm cấu hình được). Cả hai viết bằng Go 1.27, instrument bằng OpenTelemetry Go SDK (`otelhttp`, log `slog` JSON có `trace_id`). SLO dùng ở chương 6, 7 và lab là: **99,5% request tới `orders-api` thành công trong 30 ngày** (error budget 0,5%).

## Mục lục

| # | Chương | Nội dung chính |
|---|---|---|
| 1 | [Monitoring, observability và các signal](01-monitoring-observability-signals.md) | Khác biệt, 4 signal (log, metric, trace, profile), trạng thái profiling trong OTel |
| 2 | [OpenTelemetry](02-opentelemetry.md) | API/SDK, Collector, OTLP, semantic conventions, trạng thái từng ngôn ngữ (Go, JavaScript) |
| 3 | [Metric và Prometheus](03-metric-prometheus.md) | Counter/gauge/histogram, native histogram, cardinality, PromQL, RED/USE/Golden Signals |
| 4 | [Log](04-log.md) | Structured logging, trace ID, level, chi phí, sampling, dữ liệu nhạy cảm |
| 5 | [Distributed tracing](05-distributed-tracing.md) | Span, W3C Trace Context, head/tail sampling, backend |
| 6 | [SLI, SLO, error budget](06-sli-slo-error-budget.md) | Cách tính, policy khi hết budget |
| 7 | [Alerting](07-alerting.md) | Triệu chứng thay vì nguyên nhân, multi-window multi-burn-rate, runbook |
| 8 | [Dashboard](08-dashboard.md) | Dashboard hữu ích và vô ích |
| 9 | [Xử lý incident](09-incident-response.md) | Vai trò, giao tiếp, postmortem blameless |
| 10 | [Capacity và profiling liên tục](10-capacity-profiling.md) | Theo dõi resource, dự báo, continuous profiling |
| 11 | [Observability cho service Go và Node.js và database](11-go-nodejs-database-observability.md) | `otelhttp`, `otelpgx`/`otelsql`, OTel JS auto-instrumentation, runtime metrics, slow query log, `pg_stat_statements` |
| 12 | [Lab: kết quả chạy thật](12-lab-results.md) | Dựng stack, tạo traffic, xác nhận bằng API, promtool |

Mỗi chương theo cùng cấu trúc: tình huống, khái niệm, ví dụ, trade-off, cạm bẫy, tóm tắt, câu hỏi tự kiểm tra (đáp án nằm cuối file).

## Phiên bản đã dùng / đã kiểm tra (11/2026)

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| OpenTelemetry Collector (contrib) | **0.165.0** (release 07/11/2026) | Chạy trong lab |
| Prometheus + promtool | **v3.16.0** (05/11/2026) | Chạy trong lab |
| Jaeger | **2.23.0** (05/11/2026) | Chạy trong lab; Jaeger v2 xây trên Collector, API query là `/api/v3/...` |
| OpenTelemetry Go SDK | **v1.47.0** (02/10/2026) | Chạy trong lab; `otelhttp` và `runtime` instrumentation **v0.72.0**; traces/metrics Stable, Logs API/SDK stable từ v1.47.0 nhưng bridge `otelslog` còn v0.21.0 |
| Go | **1.27.3** (`golang:latest`) | Chạy trong lab; image chạy là `distroless/static` |
| Node.js | LTS 26 (v26.13.0), 24 và 22 | Chỉ chạy một script đo event loop (`node:26-alpine`); `@opentelemetry/sdk-node` 0.301.0 và `auto-instrumentations-node` 0.83.0 chỉ đọc tài liệu, **không chạy trong lab** |
| OTel Profiles signal | **Alpha** | Chưa dùng cho production; cần Collector >= 0.148.0 |
| Grafana Tempo | dòng 3.0 | Chỉ đọc tài liệu, **không chạy trong lab** |
| PostgreSQL | tài liệu 18.x | Đọc tài liệu; không chạy `pg_stat_statements` trong lab |

Trạng thái có thể thay đổi: trước khi áp dụng cho dự án thật hãy mở lại các trang trong phần đọc thêm.

## Chạy lab

Lab nằm trong [`lab/`](lab/). Yêu cầu duy nhất: Docker (có compose). Stack **không map port ra host**; mọi query đi qua một container `curl` cùng network. Tất cả tên container, network có tiền tố `bookcheck-obsgo-`.

```bash
cd lab
docker compose up -d --build            # jaeger, otel-collector, prometheus, inventory, orders
# Tạo traffic (2 đợt x 300 request; đợt 2 để rate() có dữ liệu), rồi chờ ~100 giây cho span_metrics flush
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300
sleep 100
# Xác nhận metric + trace tới backend, gọi API Prometheus và Jaeger
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/verify.sh
# Kiểm tra rule alert
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 check rules /rules/slo-orders.yml
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 test rules /rules/tests/slo-orders.test.yml
# Lấy một trace_id từ log lỗi rồi tra trace trong Jaeger: docker logs bookcheck-obsgo-orders | grep ERROR, rồi sh /scripts/trace_by_id.sh <trace_id>
# Đo event loop của Node.js (không thuộc compose; chương 11)
docker run --rm -v "$PWD/node:/app:ro" node:26-alpine node /app/eventloop.mjs
# Dọn sạch
docker compose down -v
```

Trên Git Bash (Windows) thêm `MSYS_NO_PATHCONV=1` và dùng `$(pwd -W)` thay `$PWD`. Mỗi service có `mem_limit` (tổng khoảng 1 GB). Chi tiết ở [chương 12](12-lab-results.md).

## Đọc thêm (nguồn có thật)

1. Charity Majors, Liz Fong-Jones, George Miranda, *Observability Engineering* (O'Reilly, 2022).
2. Betsy Beyer và cộng sự, *Site Reliability Engineering* (Google, 2016), đọc miễn phí tại <https://sre.google/sre-book/table-of-contents/>.
3. Betsy Beyer và cộng sự, *The Site Reliability Workbook* (Google, 2018), miễn phí tại <https://sre.google/workbook/table-of-contents/>; chương 5 "Alerting on SLOs" là nguồn của chương 7.
4. Tài liệu OpenTelemetry: <https://opentelemetry.io/docs/>.
5. Tài liệu Prometheus: <https://prometheus.io/docs/>.
