# Chapter 3. Metrics and Prometheus

## 1. Scenario

`orders-api` có 3 triệu request mỗi ngày. Bạn cần trả lời nhanh: "bao nhiêu request/giây?", "bao nhiêu phần trăm lỗi?", "latency percentile (phân vị) 95 là bao nhiêu?", và cần alert khi chúng xấu đi. Log từng request quá đắt để tính ba con số này; metric (số đo tổng hợp) sinh ra cho việc đó.

## 2. Concepts

### Four metric types

| Kiểu | Ý nghĩa | Ví dụ | Dùng thế nào |
|---|---|---|---|
| **Counter** | Chỉ tăng (reset về 0 khi process khởi động lại) | `orders_processed_total` | Luôn dùng qua `rate()` hoặc `increase()`, không đọc giá trị thô |
| **Gauge** | Lên xuống tùy ý | số DB connection đang mở, độ sâu queue | Đọc trực tiếp, hoặc `avg_over_time`, `max_over_time` |
| **Histogram** | Phân phối giá trị vào các bucket | latency request | `histogram_quantile()`; cộng gộp được giữa nhiều instance |
| **Summary** | Percentile tính sẵn ở client | hiếm dùng mới | **Không cộng gộp được** percentile giữa các instance |

Prometheus quy ước đặt tên: hậu tố `_total` cho counter, đơn vị cơ bản (giây, byte) trong tên. Metric do OTel `span_metrics` sinh ra mang đơn vị của OTel nên có tên như `traces_span_metrics_duration_milliseconds_bucket` (mili giây).

### Histograms: classic and native

**Histogram cổ điển (classic)**: bạn chọn trước dãy bucket (`le="0.1"`, `le="0.5"`...). Mỗi bucket là một series. Nhược điểm: bucket chọn sai thì percentile sai; thêm bucket thì thêm series.

**Native histogram** (Prometheus gọi là native; OTel gọi là **exponential histogram**): bucket theo cấp số nhân, tự điều chỉnh độ phân giải, **một** histogram chỉ là một series, độ chính xác cao hơn, và gộp được. Trạng thái (kiểm tra 11/2026 trong spec Prometheus): native histogram là **tính năng stable từ v3.8.0** nhưng vẫn phải **bật rõ ràng khi scrape**: từ v3.9 cờ `--enable-feature=native-histograms` chỉ còn là no-op và phải đặt `scrape_native_histograms: true` trong cấu hình (remote write có `send_native_histograms` riêng). Spec nói cả hai sẽ mặc định `true` từ v4. Cảnh báo thực tế: nếu bật `scrape_native_histograms` mà không bật `always_scrape_classic_histograms`, Prometheus chỉ nhận native, dashboard dựa trên `_bucket` cổ điển sẽ trống. Lab này dùng histogram cổ điển (do `span_metrics` xuất bucket tường minh); chưa chạy thử native histogram.

### Cardinality (number of series)

Mỗi tổ hợp giá trị label là **một series** riêng, tốn RAM và đĩa trong Prometheus.

```
http_requests_total{service, route, method, status}
  = 5 service × 40 route × 4 method × 6 status = 4.800 series   → ổn
thêm {user_id}  → × 2.000.000 người dùng                          → nổ, Prometheus OOM
```

Quy tắc: label chỉ chứa giá trị **có biên** (route đã chuẩn hóa như `/orders/{id}`, không phải `/orders/8731`; status; region). Định danh không biên (user_id, trace_id, email, URL đầy đủ) thuộc về trace và log, không thuộc metric. Trong lab, `orders.processed` có label `sku` (3 giá trị): chấp nhận được; nếu `sku` có 500.000 giá trị thì không.

### Prometheus: the pull model

```
  scrape (HTTP GET /metrics, mỗi 10s)           query (PromQL)
 target ◄────────────────── Prometheus TSDB ◄──────────────── Grafana / API / alert rule
 (otel-collector:8889)         │
                               └── rule evaluation ──► Alertmanager (gửi thông báo)
```

Prometheus chủ động kéo (scrape) từ target; có `up` tự sinh cho từng target (1 = scrape thành công). Alertmanager (thành phần riêng, không dùng trong lab) lo grouping, deduplication và routing thông báo. Prometheus còn nhận được OTLP, nhưng lab giữ mô hình pull cho đơn giản.

### PromQL basics (as used in the lab)

```promql
# Tốc độ request/giây của orders-api trong 5 phút
sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m]))

# Error rate (số lỗi / tổng)
sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER",status_code="STATUS_CODE_ERROR"}[5m]))
/ sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m]))

# Percentile 95 latency: cộng gộp bucket theo le trước khi lấy percentile
histogram_quantile(0.95,
  sum by (le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m])))
```

Ghi nhớ: `rate()` cần window (cửa sổ thời gian) chứa ít nhất vài mẫu (thường >= 4 lần scrape interval); `sum by (le)` **trước** `histogram_quantile`; không `avg` các percentile.

### Three frameworks for choosing "what to measure"

- **RED** (cho service xử lý request): **R**ate (số request/giây), **E**rrors (error rate), **D**uration (phân bố latency). Do Tom Wilkie đề xuất; áp dụng cho từng service.
- **USE** (cho resource như CPU, đĩa, connection): **U**tilization (% thời gian bận), **S**aturation (queue, phần việc phải chờ), **E**rrors. Do Brendan Gregg đề xuất.
- **Four Golden Signals** (SRE book của Google, chương "Monitoring Distributed Systems"): **latency**, **traffic**, **errors**, **saturation**. Gần như RED cộng thêm saturation. Lưu ý đo latency của request lỗi và thành công **tách riêng**, vì lỗi nhanh làm đẹp trung bình giả.

Cách dùng: RED cho mọi service (có thể sinh tự động từ span như lab), USE cho resource bên dưới (DB pool, CPU, đĩa).

## 3. Example from the lab

Kết quả thật khi chạy (xem chương 12): error rate 5 phút đo được trong khoảng 0,037 đến 0,054 (3,7 đến 5,4%) với inventory cấu hình lỗi 5% (mẫu nhỏ nên dao động); p95 latency lúc 242 ms, lúc 425 đến 460 ms tùy lần đo, vì `SLOW_RATE=5%` thêm 400 ms cho một phần request. Con số p95 được **nội suy trong bucket**, nên đáng tin theo bậc của bucket (250, 500 ms), không phải số lẻ.

## 4. Trade-offs

- Metric mạnh ở alert và xu hướng dài hạn vì rẻ; không dùng để điều tra từng request.
- Histogram cổ điển: dễ hiểu, tương thích rộng nhưng phải chọn bucket; native: chính xác và rẻ hơn khi số label nhiều, nhưng phải kiểm tra backend/dashboard hỗ trợ và bật đúng cờ.
- Sinh metric từ span (spanmetrics): tiện, khớp với trace; nhưng nếu trace bị sampling **trước** connector thì số đếm bị thấp. Đặt connector ở nơi thấy 100% span (hoặc dùng metric đếm trực tiếp trong SDK).
- Pull vs push: pull cho `up` miễn phí và dễ debug; job ngắn hạn (batch) cần Pushgateway hoặc OTLP.

## 5. Pitfalls

- Đọc counter thô thay vì `rate()`; không thấy reset.
- Label có biên không bị kiểm soát (URL, user_id, error message) gây cardinality explosion.
- Dùng `avg` của percentile, hoặc `histogram_quantile` mà quên `sum by (le)`.
- `rate()` với window quá ngắn so với scrape interval trả về rỗng.
- Số metric thấp hơn thực tế do **trùng series** (bản PHP cũ của lab từng dính: nhiều worker PHP ghi đè lên nhau; bản Go thì đọc nhầm nhãn `exported_job` và cửa sổ `rate()`, chương 12). Luôn đối chiếu số metric với số request đã gửi.
- Quên bật `scrape_native_histograms` rồi thắc mắc không có native histogram; hoặc bật mà quên `always_scrape_classic_histograms` khiến dashboard cũ trống.

## 6. Summary

- Counter + `rate()`, gauge đọc trực tiếp, histogram cho latency; summary khó cộng gộp.
- Cardinality = tích số giá trị label; định danh không biên không được làm label.
- Native/exponential histogram stable từ Prometheus v3.8, nhưng phải bật `scrape_native_histograms`.
- RED cho service, USE cho resource, Golden Signals bao cả hai ở mức cao.

## 7. Self-check questions

1. Vì sao không `avg` các percentile p95 của 10 instance?
2. `http_requests_total{user_id=...}` có vấn đề gì và thay bằng gì?
3. Phân biệt RED và USE: dùng cho đối tượng nào?
4. Native histogram khác classic ở điểm nào, và cần làm gì để Prometheus v3.9+ thu được nó?
5. Viết PromQL error rate 5 phút của một service có metric `calls_total{status_code}`.

<details><summary>Answer</summary>

1. Percentile không cộng gộp được; trung bình của p95 không phải p95 của tổng. Phải cộng gộp bucket (`sum by (le)`) rồi mới `histogram_quantile`.
2. Hàng triệu giá trị tạo hàng triệu series gây quá tải. Dùng label có biên (route, status); chi tiết theo người dùng đặt vào trace/log.
3. RED cho service xử lý request (rate, errors, duration); USE cho resource (utilization, saturation, errors).
4. Bucket theo cấp số nhân tự điều chỉnh, một series cho cả histogram. Cần `scrape_native_histograms: true` (cờ feature cũ đã no-op từ v3.9); cẩn thận `always_scrape_classic_histograms`.
5. `sum(rate(calls_total{status_code="ERROR"}[5m])) / sum(rate(calls_total[5m]))`; thêm `or vector(0)` ở tử số nếu muốn có giá trị 0 khi không có lỗi.
</details>
