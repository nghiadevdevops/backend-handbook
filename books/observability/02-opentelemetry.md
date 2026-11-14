# Chương 2. OpenTelemetry

## 1. Tình huống

Mỗi vendor có agent và định dạng riêng. Đổi backend nghĩa là sửa code instrument ở mọi service. Trong khi đó bạn muốn: một cách instrument duy nhất, dữ liệu đi tới bất kỳ backend nào, và log/metric/trace dùng chung tên attribute. Đó là việc của **OpenTelemetry (OTel)**: dự án thuộc CNCF, định nghĩa API, SDK, giao thức (OTLP), quy ước tên (semantic conventions) và một Collector, **không** phải một backend lưu trữ.

## 2. Khái niệm

### Các thành phần

```
 App (code của bạn)
   │ gọi OTel API (tracer, meter)     ← ổn định, ít đổi, thư viện chỉ phụ thuộc API
   ▼
 OTel SDK (sampler, processor, exporter, resource)
   │ OTLP (gRPC :4317 | HTTP :4318)
   ▼
 Collector:  receiver ─► processor ─► exporter     (pipeline theo từng signal)
                              └─ connector nối pipeline này sang pipeline khác
   ▼
 Backend: Jaeger / Tempo (trace), Prometheus (metric), Loki/Elastic (log), ...
```

- **API**: giao diện để code (và thư viện) ghi telemetry. Không làm gì nếu không có SDK, nên thư viện bên thứ ba có thể phụ thuộc API an toàn.
- **SDK**: hiện thực API: sampling, batch, gắn **resource** (`service.name`, `service.version`, `host.name`...), export dữ liệu.
- **OTLP**: giao thức export chung (protobuf trên gRPC hoặc HTTP; cổng mặc định 4317 và 4318).
- **Semantic conventions**: tên chuẩn cho attribute (`http.request.method`, `http.response.status_code`, `url.path`, `server.address`, `db.system.name`...). Nhờ đó backend dựng được màn hình chung cho mọi ngôn ngữ. Trạng thái ổn định khác nhau theo lĩnh vực (HTTP đã stable; trang database của spec ghi trạng thái "Mixed" khi kiểm tra); instrumentation cũ dùng biến `OTEL_SEMCONV_STABILITY_OPT_IN` để chuyển dần sang tên mới (`database` để đổi hẳn, `database/dup` để phát cả hai). Lab dùng `db.system.name` và `db.operation.name` (tên theo quy ước mới; chưa đối chiếu từng attribute với bản spec mới nhất).
- **Collector**: tiến trình độc lập nhận, xử lý, chuyển tiếp telemetry. Các loại component: receiver, processor, exporter, connector, extension. Docs khuyên production nên có Collector chạy cạnh service vì nó gánh việc batch, retry, mã hóa, lọc dữ liệu nhạy cảm.

### Trạng thái ổn định (kiểm tra 11/2026)

Theo bảng trên trang `opentelemetry.io/docs/languages/`:

| Ngôn ngữ | Traces | Metrics | Logs |
|---|---|---|---|
| Java | Stable | Stable | Stable |
| **JavaScript** | **Stable** | **Stable** | **Development** |
| **Go** | **Stable** | **Stable** | Release candidate (theo docs; CHANGELOG ghi `otel/log` và `otel/sdk/log` stable từ v1.47.0) |
| Python | Stable | Stable | Development |

Với Go, traces và metrics Stable, logs còn "Release candidate" trên trang docs, nhưng CHANGELOG của `opentelemetry-go` ghi bản **v1.47.0 (02/10/2026)** là bản stable đầu tiên của Logs API/SDK (`otel/log`, `otel/sdk/log`); bridge `contrib/bridges/otelslog` (cho `log/slog`) khi kiểm tra vẫn là module v0 (v0.21.0). Docs yêu cầu Go từ 1.23 trở lên (trang getting-started); từ v1.47.0 module cần Go 1.26 trở lên (theo ghi chú trong CHANGELOG). Với JavaScript: traces và metrics Stable, logs ở mức Development; SDK hỗ trợ các bản LTS active/maintenance của Node.js. **Lưu ý trong tài liệu:** instrumentation dựa trên semantic conventions còn experimental vẫn có thể đổi tên attribute dù SDK ổn định. "Stable" áp dụng cho API/SDK chứ không tự động cho mọi package instrumentation (các package contrib như `otelhttp` còn là `v0.x`).

Collector có nhiều distribution (core, contrib...). Bản **contrib** chứa gần như mọi component cộng đồng (spanmetrics, delta-to-cumulative...) và là bản dùng trong lab (0.165.0). Collector có trạng thái "mixed": mỗi component có mức stability riêng, ghi trong README của nó. Các alias tên component cũng đang được đổi: ở 0.165.0, `otlp` (exporter) in warning "deprecated, dùng `otlp_grpc`", `deltatocumulative` thành `delta_to_cumulative`, `spanmetrics` thành `span_metrics`. Chúng ta dùng tên mới trong lab.

### Auto và manual instrumentation

- **Auto-instrumentation**: thư viện tự "móc" vào framework/HTTP client/DB driver, sinh span mà không sửa code. Trong Node.js dùng `@opentelemetry/auto-instrumentations-node` (chương 11). Go là ngôn ngữ biên dịch nên không "móc" lúc chạy được: dùng thư viện instrumentation bọc handler/client (`otelhttp`, `otelsql`, `otelpgx`) hoặc công cụ ngoài như eBPF; vẫn phải sửa code ở chỗ khởi tạo.
- **Manual instrumentation**: bạn gọi API tạo span, metric, attribute nghiệp vụ (`order.id`, `sku`).
- Thực tế: dùng auto để có xương sống (HTTP, DB, queue) và manual để thêm ngữ cảnh nghiệp vụ.

## 3. Ví dụ: lab

Code đầy đủ ở `lab/app/main.go`. Lab dùng **SDK Go** (`go.opentelemetry.io/otel` v1.47.0) với `otelhttp` cho phần HTTP và manual span cho "query DB". Điểm chính:

```go
// SDK đọc OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT từ biến môi trường
res, _ := resource.New(ctx, resource.WithFromEnv(), resource.WithTelemetrySDK())
te, _ := otlptracehttp.New(ctx)
tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(te), sdktrace.WithResource(res))
otel.SetTracerProvider(tp)
otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

handler := otelhttp.NewHandler(mux, "server")   // span SERVER, đọc traceparent từ request đến
client  := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)} // span CLIENT, chèn traceparent
```

Collector trong lab (`lab/otel/collector.yaml`) có hai pipeline:

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp_grpc/jaeger, span_metrics]     # span_metrics là connector
    metrics:
      receivers: [otlp, span_metrics]
      processors: [memory_limiter, batch]
      exporters: [prometheus]                         # Prometheus scrape :8889
```

Hai điểm thiết kế đáng học:

1. **Connector `span_metrics`** biến span thành metric RED (số request, latency theo status). Không cần tự đếm trong code; số liệu luôn khớp với trace (lab: 600 request cho đúng 600 lần đếm, chương 12).
2. **Metrics cumulative, không cần `delta_to_cumulative`**: process Go sống lâu, SDK export giá trị cộng dồn (mặc định), Prometheus dùng được ngay. (Bản PHP cũ của lab cần `delta_to_cumulative` vì mỗi request là một process; xem chương 12.)

### Bài học khi chạy lab

Metric ở Prometheus thấp hơn hoặc rỗng ngay sau khi gửi traffic **không** có nghĩa là mất dữ liệu: connector `span_metrics` flush theo chu kỳ, và `rate()` của series mới xuất hiện cho `NaN` cho đến khi counter tăng trong cửa sổ. Cũng nhớ rằng `service.name` của SDK thành nhãn `exported_job` khi Prometheus scrape Collector. Bài học: **luôn đối chiếu số metric với số request đã gửi** và đọc đúng nhãn; chi tiết ở chương 12.

## 4. Trade-off

- **Dùng OTel**: không vendor lock-in, một bộ instrument; đổi lại phải tự vận hành Collector và theo kịp thay đổi nhanh (tên alias, semconv).
- **SDK gửi thẳng backend vs qua Collector**: gửi thẳng đơn giản cho dev; production nên qua Collector để batch/retry/lọc/đổi backend không cần deploy lại app.
- **Auto vs manual**: auto nhanh nhưng có thể sinh quá nhiều span; manual chính xác nhưng tốn công.
- **Go**: phải tự bọc handler/client và truyền `context` đi khắp nơi; đổi lại SDK nhẹ (mỗi service lab dùng ≈ 9 MiB) và export ở goroutine nền. Quên `Shutdown` khi tắt thì mất dữ liệu cuối.

## 5. Cạm bẫy

- Quên `service.name`: telemetry xuất hiện là `unknown_service`.
- Dùng nhiều tên attribute cho cùng một khái niệm (`http.method` cũ và `http.request.method` mới).
- Không đặt `memory_limiter` đầu pipeline: Collector có thể OOM khi backend chậm.
- Nhầm temporality: gửi delta vào Prometheus mà không có `delta_to_cumulative` thì counter nhảy loạn.
- Tin "Stable" nghĩa là mọi thứ ổn định: xem stability của từng package/component.

## 6. Tóm tắt

- OTel = API + SDK + OTLP + semantic conventions + Collector; không phải backend.
- Traces và metrics của Go và JavaScript đều Stable; logs: Go có API/SDK stable từ v1.47.0 nhưng bridge `slog` còn v0, JavaScript còn Development; Profiles chưa. Luôn kiểm tra stability từng component.
- Collector là điểm kiểm soát: batch, lọc, routing, sinh metric từ span.
- Tên component Collector đang đổi (alias deprecated); đọc warning khi khởi động.

## 7. Câu hỏi tự kiểm tra

1. API và SDK khác nhau thế nào, và vì sao thư viện chỉ nên phụ thuộc API?
2. Vì sao lab Go không cần `delta_to_cumulative` còn bản PHP cũ cần?
3. Kể 3 lợi ích của việc đặt Collector giữa app và backend.
4. Vì sao Go không có auto-instrumentation kiểu "móc" lúc chạy như Node.js?
5. Vì sao metric ở Prometheus có thể bằng 0 hoặc `NaN` ngay sau đợt traffic đầu, và cách xử lý?

<details><summary>Đáp án</summary>

1. API là giao diện ghi telemetry (no-op nếu không có SDK); SDK là hiện thực (sampling, batch, export). Thư viện chỉ phụ thuộc API để không ép ứng dụng dùng một SDK cụ thể.
2. Process Go sống lâu và SDK export giá trị cộng dồn (cumulative) sẵn, nên Prometheus dùng được ngay; bản PHP cũ chạy theo request, chỉ export phần tăng (delta) nên cần Collector cộng dồn.
3. Batch và retry, lọc/che dữ liệu nhạy cảm, đổi hoặc thêm backend không sửa app; còn sinh metric từ span, tail sampling.
4. Go là ngôn ngữ biên dịch, không có hook lúc chạy tương đương `--require` của Node.js; phải bọc handler/client bằng thư viện instrumentation (`otelhttp`...) hoặc dùng eBPF.
5. Connector `span_metrics` flush theo chu kỳ, và `rate()` của series mới xuất hiện bằng 0 (`0/0 = NaN`) cho tới khi counter tăng trong cửa sổ. Chờ 1 đến 2 phút và gửi thêm một đợt traffic (chương 12).
</details>
