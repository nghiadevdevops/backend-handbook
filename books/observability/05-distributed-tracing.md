# Chapter 5. Distributed Tracing

## 1. Scenario

`GET /order` mất 900 ms. `orders-api` gọi `inventory-svc`, `inventory-svc` query DB. Metric nói "p95 chậm" nhưng không nói chậm **ở chặng nào**. Log từng service chỉ cho thấy từng mảnh. Cần một bản ghi nối cả hành trình của *một* request qua mọi service: đó là **distributed trace**.

## 2. Concepts

### Traces and spans

- **Trace**: toàn bộ hành trình của một yêu cầu, có một `trace_id` (16 byte, 32 ký tự hex).
- **Span**: một đoạn công việc có tên, thời điểm bắt đầu/kết thúc, `span_id` (8 byte, 16 hex), `parent_span_id`, loại (kind), attribute, event, trạng thái (`UNSET`, `OK`, `ERROR`).
- **Span kind**: `SERVER` (nhận request), `CLIENT` (gọi đi), `INTERNAL`, `PRODUCER`/`CONSUMER` (queue).

Cây span thật lấy từ lab (Jaeger API):

```text
orders-api    GET /order                 (SERVER)
 └─ orders-api   GET inventory /reserve  (CLIENT)
     └─ inventory-svc  GET /reserve      (SERVER)   ← parent_span_id trỏ về span CLIENT ở service khác
         └─ inventory-svc  SELECT stock  (CLIENT, db.system.name=postgresql)
```

### Context propagation and W3C Trace Context

Để `inventory-svc` biết nó thuộc trace nào, `orders-api` phải truyền ngữ cảnh qua header HTTP. Chuẩn là **W3C Trace Context** (khuyến nghị chính thức của W3C từ 2021; OTel dùng làm propagator mặc định):

```text
traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
             │   │                                │                └ trace-flags (01 = sampled)
             │   │                                └ parent-id (span_id của bên gọi)
             │   └ trace-id (32 hex)
             └ version
tracestate:  vendor1=value,...    (tùy chọn, thông tin riêng của từng vendor)
```

Ví dụ trên là ví dụ minh họa của spec, không phải trace thật trong lab. Trong lab, `orders-api` gọi `$propagator->inject($headers)` rồi gắn các header đó vào cURL; `inventory-svc` gọi `$propagator->extract(getallheaders())` và đặt làm parent cho span SERVER của mình. Kết quả: hai service chung một `trace_id` (kiểm chứng ở chương 12: một trace chứa span của cả `orders-api` và `inventory-svc`).

Context phải được truyền ở **mọi** chặng: HTTP, gRPC, và đặc biệt **queue/job** (đưa `traceparent` vào message header/payload, ở bên nhận tạo span với *link* hoặc parent). Một chặng không truyền = trace đứt thành hai. Ngoài trace context còn có **baggage** (cặp key-value đi cùng request, ví dụ `tenant=acme`); cẩn thận: baggage đi theo mọi request ra ngoài, không đặt dữ liệu nhạy cảm.

### Sampling

Lưu 100% trace thường quá đắt. Hai trường phái:

| | Head sampling | Tail sampling |
|---|---|---|
| Quyết định lúc nào | Khi trace **bắt đầu** | Sau khi trace **kết thúc** (đủ span) |
| Dựa vào | Tỉ lệ ngẫu nhiên (theo trace ID), hoặc cha đã quyết | Toàn bộ trace: có lỗi, chậm, thuộc khách VIP... |
| Ưu | Rẻ, đơn giản, làm ngay trong SDK | Giữ đúng trace "đáng giá" (lỗi, chậm) |
| Nhược | Có thể bỏ mất trace lỗi hiếm | Tốn RAM Collector, phức tạp, cần gom mọi span của một trace về cùng một instance |

- **Head**: sampler của SDK như `ParentBased(TraceIdRatioBased(0.1))`: giữ 10% trace gốc, còn service con làm theo quyết định của cha (cờ `sampled` trong `traceparent`).
- **Tail**: `tail_sampling` processor trong Collector contrib: đặt các policy ("giữ mọi trace có lỗi", "giữ trace > 500 ms", "giữ 5% còn lại"). Khi có nhiều Collector, phải routing theo `trace_id` (ví dụ exporter `loadbalancing`) để mọi span của một trace tới cùng một instance.
- Hai cách kết hợp được: head cho giảm tải thô, tail để giữ lại các trace lỗi/chậm. Nhưng head sampling trước sẽ làm tail sampling không bao giờ thấy trace đã bị bỏ.

Chú ý quan hệ với metric: nếu sinh metric RED từ span (như lab) thì connector phải thấy **100% span**, đặt **trước** tail sampling; nếu không các con số (số request, error rate) bị lệch.

### Backend

| Backend | Ghi chú (kiểm tra 11/2026) |
|---|---|
| **Jaeger** | Phiên bản mới nhất **2.23.0** (05/11/2026). Jaeger v2 xây trên nền OpenTelemetry Collector, nhận OTLP trực tiếp (4317/4318), UI ở 16686. Image mặc định lưu trong memory (mất khi restart), phù hợp học tập. API query mới là `/api/v3/...` (`/api/v3/services`, `/api/v3/traces`); đường dẫn `/api/services` của Jaeger v1 trả 404 ở bản này. |
| **Grafana Tempo** | Theo tài liệu chính thức, dòng hiện tại là **3.0**: tách đường đọc và ghi, lưu trên object storage, query bằng TraceQL, TraceQL metrics đã GA. **Chưa chạy thử trong lab này.** |
| Dịch vụ thương mại (Datadog, Honeycomb, ...) | Nhận OTLP; trả phí theo dữ liệu |

Chọn backend: Jaeger đủ cho học tập và hệ thống vừa nếu cấu hình storage phù hợp; Tempo hợp khi đã dùng hệ Grafana và cần traffic lớn rẻ trên object storage.

## 3. Example from the lab

Query Jaeger API v3 từ container `curl` (đã chạy thật):

```bash
S=$(date -u -d @$(( $(date +%s) - 3600 )) +%Y-%m-%dT%H:%M:%SZ)
E=$(date -u -d @$(( $(date +%s) + 60 )) +%Y-%m-%dT%H:%M:%SZ)
curl -s -G http://jaeger:16686/api/v3/traces \
  --data-urlencode "query.service_name=orders-api" \
  --data-urlencode "query.start_time_min=$S" --data-urlencode "query.start_time_max=$E" \
  --data-urlencode 'query.attributes={"http.response.status_code":"502"}' \
  --data-urlencode "query.num_traces=3"
```

Lưu ý: `query.start_time_min/max` bắt buộc; `query.attributes` là JSON với **giá trị chuỗi** (`"502"`; truyền số 502 không khớp). Tìm theo attribute này ra 3 trace lỗi, đúng với yêu cầu "tìm trace lỗi của orders-api" ở chương 1.

## 4. Trade-offs

- **Trace đầy đủ** giúp chẩn đoán nhưng tốn: số span = số chặng × số request. Hãy bắt đầu với head sampling thấp và tail sampling giữ lỗi/chậm.
- **Nhiều span quá nhỏ** (mỗi hàm một span) làm trace khó đọc và tốn tiền; span nên ở ranh giới quan trọng: gọi ra ngoài, query DB, đoạn xử lý đáng kể.
- **Attribute**: nhiều attribute nghiệp vụ (`order.id`, `customer.tier`) làm trace có giá trị; nhưng không đưa dữ liệu nhạy cảm vào.
- **Go và Node.js**: export span ở nền theo batch (`BatchSpanProcessor`), gần như không tăng latency request; chi phí là bộ nhớ đệm và nguy cơ mất span cuối nếu quên `Shutdown` khi tắt service (chương 2).

## 5. Pitfalls

- Quên truyền context qua queue, job bất đồng bộ, hoặc dùng HTTP client không được instrument: trace đứt.
- Tail sampling ở nhiều Collector mà không routing theo trace ID: trace bị cắt nhỏ, quyết định sai.
- Đặt head sampling thấp rồi ngạc nhiên vì không tìm thấy trace của một lỗi hiếm.
- Đồng hồ lệch giữa host làm span con có vẻ bắt đầu trước cha.
- Nhầm Jaeger v1 và v2: API và cấu hình khác nhau (v2 dùng cấu hình kiểu Collector).
- Dùng URL đầy đủ làm tên span (`GET /orders/8731`) gây cardinality cao cho metric sinh từ span; dùng route (`GET /orders/{id}`).

## 6. Summary

- Trace = cây span nối các service qua `trace_id`; span kind giúp backend hiểu quan hệ.
- W3C Trace Context (`traceparent`) là chuẩn truyền context; phải truyền ở mọi chặng, kể cả queue.
- Head sampling rẻ nhưng mù trước kết quả; tail sampling giữ trace đáng giá nhưng tốn tài nguyên và cần routing theo trace ID.
- Jaeger 2.23.0 (API `/api/v3`) chạy được trong lab; Tempo 3.0 là lựa chọn quy mô lớn (chưa chạy thử).

## 7. Self-check questions

1. Giải thích các phần của `traceparent`.
2. Vì sao một chặng quên truyền header làm trace bị đứt?
3. Khi nào chọn tail sampling thay vì head sampling, và cái giá phải trả?
4. Vì sao connector sinh metric RED nên đặt trước bước tail sampling?
5. Trong Jaeger v2.23, bạn gọi API nào để liệt kê service?

<details><summary>Answer</summary>

1. `version-traceid-parentid-flags`: phiên bản, 32 hex trace ID, 16 hex span ID của bên gọi, cờ (bit 01 = sampled).
2. Service sau không có trace ID/parent để dùng nên tạo trace mới; hai nửa không nối với nhau.
3. Khi cần luôn giữ trace lỗi hoặc chậm. Giá: Collector giữ span trong RAM chờ trace kết thúc và phải gom các span của một trace về cùng instance.
4. Để metric đếm 100% span; sau sampling số đếm bị thấp và error rate sai.
5. `GET /api/v3/services` trên cổng 16686 (`/api/services` kiểu v1 trả 404 ở bản này).
</details>
