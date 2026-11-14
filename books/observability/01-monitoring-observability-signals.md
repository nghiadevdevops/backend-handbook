# Chapter 1. Monitoring, Observability and Signals

## 1. Scenario

Thứ Sáu 17:40, kênh chat báo: "đặt hàng chậm". Dashboard CPU của `orders-api` bình thường, RAM bình thường, không có alert nào. Vậy mà một nhóm khách hàng ở một khu vực bị timeout. Bạn không biết bắt đầu từ đâu: lỗi ở service nào, ở loại request nào, ở nhóm khách nào?

Đây là khoảng cách giữa **monitoring** (biết hệ thống có đang khỏe hay không theo những thứ ta đã nghĩ trước) và **observability** (khả năng đặt những câu hỏi mới về hệ thống mà không phải deploy code mới).

## 2. Concepts

### Monitoring and observability

- **Monitoring**: thu thập, hiển thị, alerting trên một tập chỉ số đã biết trước ("CPU > 90%", "HTTP 5xx > 1%"). Trả lời câu hỏi *known unknowns*: ta biết cần hỏi gì.
- **Observability** (khả năng quan sát): tính chất của hệ thống cho phép suy ra trạng thái bên trong từ dữ liệu telemetry nó phát ra. Trả lời được cả *unknown unknowns*: những câu hỏi ta chưa nghĩ tới lúc viết code. Thực tế đo bằng một phép thử: gặp lỗi lạ, bạn có khoanh vùng được nguyên nhân chỉ bằng dữ liệu hiện có, hay phải thêm log rồi deploy lại?

Hai khái niệm không đối lập: monitoring là việc bạn *làm* (alert, dashboard), observability là *năng lực dữ liệu* khiến việc đó hiệu quả. Điều kiện thực dụng của observability là **dữ liệu giàu ngữ cảnh** (nhiều attribute như `customer_id`, `region`, `sku`, `build_version`) và **khả năng cắt lát theo bất kỳ attribute nào** khi điều tra.

### Four signals

```
 Request ──► orders-api ──► inventory-svc ──► DB
              │                 │
   ┌──────────┴─────────────────┴───────────┐
   │  log     : "chuyện gì đã xảy ra"       │  event rời rạc, text/JSON
   │  metric  : "bao nhiêu, nhanh cỡ nào"   │  số đo tổng hợp theo thời gian
   │  trace   : "request đi qua đâu, mất bao│  cây span nối nhiều service
   │            lâu ở từng chặng"           │
   │  profile : "CPU/RAM tiêu vào dòng code │  sampling call stack
   │            nào"                        │
   └────────────────────────────────────────┘
```

| Signal | Trả lời | Chi phí lưu trữ | Điểm mạnh | Điểm yếu |
|---|---|---|---|---|
| Metric | Hệ thống có ổn không? Xu hướng ra sao? | Thấp, tỉ lệ với số **series** | Rẻ, alert chính xác, lưu dài hạn | Mất chi tiết từng request; cardinality cao thì nổ |
| Log | Chuyện gì đã xảy ra ở một thời điểm? | Cao, tỉ lệ với **lượng event** | Chi tiết, dễ phát ra | Khó tổng hợp, tốn kém nếu ghi quá nhiều |
| Trace | Request này chậm ở đâu, qua service nào? | Trung bình đến cao, thường phải sampling | Thấy quan hệ giữa các service | Cần propagate context ở mọi chặng |
| Profile | Dòng code nào đốt CPU/RAM? | Trung bình | Chỉ ra điểm nóng ở mức hàm | Signal mới nhất, chuẩn hóa còn non |

Điều quan trọng không phải chọn một signal mà **liên kết** chúng: từ alert (metric) nhảy sang trace mẫu có lỗi, từ span sang log cùng `trace_id`, từ span chậm sang profile của đúng khoảng thời gian đó. Chương 4, 5 và 10 quay lại việc này.

### Profiles in OpenTelemetry: current status

Theo trang khái niệm của OpenTelemetry, signal được hỗ trợ ổn định là **traces, metrics, logs, baggage**; **Profiles** nằm ở nhóm "đang phát triển". Blog chính thức của dự án ("OpenTelemetry Profiles Enters Public Alpha", 2026) nêu rõ: Profiles ở mức **Alpha**, *không nên dùng cho workload production quan trọng*, chưa có backend sẵn sàng production. Điểm đáng nhớ từ bài đó:

- Collector cần phiên bản **>= v0.148.0** để hỗ trợ Profiles; có pprof receiver; có thể chuyển đổi pprof sang OTLP Profiles và ngược lại không mất thông tin.
- Có eBPF profiling agent (chạy được như một receiver của Collector) cho profiling toàn hệ thống trên Linux, không cần sửa code ứng dụng.
- Bảng trạng thái theo ngôn ngữ trên docs OTel chỉ liệt kê Profiles cho Java (mức Development) tại thời điểm kiểm tra; Go và Python **không liệt kê** (JavaScript tôi chưa kiểm).

Hệ quả thực tế: hiện nay profiling liên tục vẫn dùng công cụ riêng (Pyroscope, Parca, Grafana Alloy...) hoặc eBPF; xem chương 10. Đừng thiết kế hệ thống phụ thuộc vào OTLP Profiles ổn định.

## 3. Example: one incident, four signals

Với `orders-api` trong lab, khi inventory lỗi 5%:

1. **Metric** cho thấy error rate `orders-api` tăng (`service:orders_error_ratio:rate5m` ≈ 0,04 đến 0,05 trong lab). Đây là chuông báo.
2. **Trace**: tìm trace có `http.response.status_code=502`, thấy cây span `GET /order` → `GET inventory /reserve` → `GET /reserve` (lỗi) → `SELECT stock`. Lỗi nằm ở inventory, không phải ở orders.
3. **Log**: lọc dòng log có cùng `trace_id` thấy `"msg":"stock backend unavailable"`.
4. **Profile** (nếu latency (độ trễ), không phải lỗi, là vấn đề): xem flame graph của inventory trong khoảng thời gian đó.

Chuỗi này chỉ chạy được nếu mọi signal mang chung **trace ID** và tên service nhất quán: đó là lý do ta dùng OpenTelemetry (chương 2).

## 4. Trade-offs: what you need when

- Hệ thống một process, vài người dùng: log có cấu trúc và vài metric là đủ. Đừng dựng cả Collector + Jaeger.
- Nhiều service gọi nhau: **trace** gần như bắt buộc, vì log riêng từng service không cho thấy đường đi.
- Chi phí quan sát tăng theo lượng dữ liệu: budget cho telemetry thường là hạng mục đáng kể. Quyết định giữ gì, sample gì là quyết định thiết kế, không phải việc "bật hết lên".
- Observability không thay thế test, code review hay thiết kế chống lỗi; nó rút ngắn thời gian *phát hiện và chẩn đoán*.

## 5. Pitfalls

- **Ba trụ cột thành checklist**: có đủ log, metric, trace nhưng rời rạc, không liên kết được thì vẫn mù.
- **Dashboard thay cho khả năng đặt câu hỏi**: dashboard là câu hỏi đã biết. Cần công cụ query tự do (lọc theo attribute).
- **Chỉ đo resource (CPU, RAM)** mà không đo trải nghiệm người dùng (latency, error rate).
- **Đặt tên không nhất quán** (`svc`, `service`, `app`) giữa log, metric, trace khiến không join được.
- **Gắn label định danh cao (user_id) vào metric**: dành cho trace/log, không cho metric (chương 3).

## 6. Summary

- Monitoring trả lời câu đã biết; observability cho phép hỏi câu chưa biết từ dữ liệu giàu ngữ cảnh.
- Bốn signal bổ sung nhau: metric (xu hướng, alert), log (chi tiết event), trace (đường đi), profile (điểm nóng trong code).
- Giá trị nằm ở việc liên kết signal bằng trace ID và tên resource nhất quán.
- OTel Profiles hiện là Alpha: chưa dựa vào nó cho production; traces, metrics, logs là Stable.

## 7. Self-check questions

1. Nêu một câu hỏi mà monitoring truyền thống khó trả lời nhưng observability trả lời được.
2. Vì sao metric rẻ hơn log nhưng không thay được log?
3. Một alert error rate tăng. Bạn dùng signal nào, theo thứ tự nào, để tìm nguyên nhân?
4. Hiện nay (11/2026) bạn có nên dùng OTLP Profiles cho profiling production không? Vì sao?
5. Tại sao "đủ ba trụ cột" chưa đồng nghĩa với "có observability"?

<details><summary>Answer</summary>

1. Ví dụ: "Vì sao chỉ khách ở khu vực X dùng build 2.3.1 và coupon Y bị timeout?" cần cắt lát theo nhiều attribute tùy ý, thứ mà dashboard dựng sẵn không có.
2. Metric là số đo tổng hợp trước nên chi phí tỉ lệ với số series, không với số event. Nhưng vì đã tổng hợp nên mất chi tiết từng request; log/trace giữ chi tiết đó.
3. Metric (xác định phạm vi, từ khi nào) → trace mẫu có lỗi (service và chặng nào) → log cùng trace ID (message lỗi) → profile nếu là vấn đề hiệu năng.
4. Không cho workload quan trọng: dự án tuyên bố Alpha, chưa có backend production, data model còn có thể đổi. Dùng công cụ profiling đã trưởng thành, theo dõi tiến độ OTel.
5. Nếu các signal không chung ID/tên/attribute thì không nhảy qua lại được và không đặt được câu hỏi mới; chỉ là ba kho dữ liệu riêng.
</details>
