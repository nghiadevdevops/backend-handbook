# Chapter 7. Alerting

## 1. Scenario

03:12 sáng, điện thoại rung: "CPU inventory > 80%". Bạn dậy, kiểm tra: người dùng vẫn đặt hàng bình thường, không có gì sai. Tuần sau lặp lại. Sau một tháng cả đội tắt tiếng kênh alert; đúng đêm có incident thật thì không ai nghe. Đó là **alert fatigue** (mệt mỏi vì cảnh báo): hệ quả của alert theo nguyên nhân tiềm năng thay vì theo ảnh hưởng thật.

## 2. Concepts

### Alert on symptoms, not causes

- **Triệu chứng (symptom)**: điều người dùng cảm nhận: lỗi, chậm, không dùng được. Alert "error rate đặt hàng cao" luôn đáng thức người dậy.
- **Nguyên nhân (cause)**: CPU cao, đĩa đầy 70%, một pod restart. Có thể gây ra triệu chứng, cũng có thể vô hại.

Nguyên tắc từ Google SRE: **page** (đánh thức người) chỉ khi cần con người hành động *ngay* và đã có ảnh hưởng người dùng thật hoặc sắp có. Mọi thứ còn lại là **ticket** (xử lý trong giờ làm việc) hoặc chỉ hiện trên dashboard. Alert theo nguyên nhân vẫn có chỗ: khi nó *dự báo chắc chắn* (đĩa sẽ đầy trong 4 giờ) thì là ticket hoặc page có điều kiện; còn dùng để *chẩn đoán* thì để trên dashboard.

Kiểm tra mỗi alert bằng 4 câu: Có cần hành động của con người không? Có thể tự động hóa không? Có khẩn cấp không? Nó có thật sự xảy ra khi người dùng bị ảnh hưởng không? Trả lời "không" cho câu đầu thì xóa alert.

### Why simple threshold alerts are not enough

Alert kiểu `error_ratio > 1% trong 5 phút`: nhạy với đợt lỗi ngắn không đáng kể (cháy chuông giả), nhưng bỏ sót lỗi dai dẳng 0,8% kéo dài cả tuần (vẫn đốt hết budget). Cần một cơ chế gắn chặt với SLO: dựa trên tốc độ đốt error budget.

### Multi-window, multi-burn-rate (SRE Workbook, chapter 5)

Ý tưởng: alert khi budget bị đốt **nhanh hơn mức chấp nhận được**, dùng nhiều tốc độ để vừa bắt incident nghiêm trọng (nhanh) vừa bắt incident âm ỉ (chậm), và dùng **hai window** để vừa phát hiện sớm vừa tắt nhanh khi đã hết lỗi.

- Window **dài** đảm bảo incident đã đốt đủ budget đáng kể (giảm báo giả).
- Window **ngắn** (khuyến nghị bằng **1/12** window dài) đảm bảo incident *vẫn đang xảy ra*, nên alert tắt nhanh sau khi hồi phục (reset time ngắn).
- Alert bật khi **cả hai** cùng vượt threshold.

Bảng tham số khuyến nghị của Workbook (SLO 99,9%, window 30 ngày):

| Mức | Window dài | Window ngắn | Burn rate | Budget bị đốt khi bật | Hành động |
|---|---|---|---|---|---|
| 1 | 1 giờ | 5 phút | 14,4 | 2% | Page |
| 2 | 6 giờ | 30 phút | 6 | 5% | Page |
| 3 | 3 ngày | 6 giờ | 1 | 10% | Ticket |

Nguồn của các số: `budget bị đốt = burn rate × window dài / chu kỳ SLO`. Kiểm tra: 14,4 × 1 giờ / 720 giờ = 2%; 6 × 6 / 720 = 5%; 1 × 72 / 720 = 10%.

Threshold error rate = `burn rate × (1 − SLO)`. Với SLO của lab 99,5% (budget 0,005): 14,4 → 7,2%; 6 → 3%; 1 → 0,5%.

### The lab's Prometheus rules

File `lab/rules/slo-orders.yml`. Đầu tiên là recording rule tính error rate theo từng window (5m, 30m, 1h, 6h, 3d), dùng `or vector(0)` để không mất series khi chưa có lỗi nào:

```yaml
- record: service:orders_error_ratio:rate1h
  expr: |
    (sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER",status_code="STATUS_CODE_ERROR"}[1h])) or vector(0))
    / sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[1h]))
```

Rồi alert, mỗi cái yêu cầu window dài VÀ window ngắn:

```yaml
- alert: OrdersErrorBudgetBurnFast          # 14,4x: page
  expr: |
    service:orders_error_ratio:rate1h > (14.4 * 0.005)
    and
    service:orders_error_ratio:rate5m > (14.4 * 0.005)
  labels: {severity: page, slo: orders-availability}
  annotations:
    summary: "orders-api dot error budget gap 14.4 lan (het 2% budget thang trong 1 gio)"
    runbook_url: "https://example.internal/runbooks/orders-error-budget"
- alert: OrdersErrorBudgetBurnSlow          # 6x:  6h & 30m, page
- alert: OrdersErrorBudgetBurnTicket        # 1x:  3d & 6h,  ticket
```

(Hai alert sau cùng cấu trúc; xem file đầy đủ. `runbook_url` là địa chỉ minh họa `example.internal`, không tồn tại thật.)

### Checking with promtool

`promtool check rules` kiểm cú pháp: kết quả thật `SUCCESS: 8 rules found` (5 recording, 3 alert). `promtool test rules` chạy kịch bản trên dữ liệu giả; file `lab/rules/tests/slo-orders.test.yml` có 4 ca và **đều qua** (`SUCCESS`):

1. Lỗi ổn định 10% trong 100 phút: cả 3 alert đều bật.
2. Lỗi 0,33% (dưới budget 0,5%): **không** alert nào.
3. Incident ngắn (khoảng 12 phút lỗi gần 100%) rồi hồi phục. Phút 56 (giữa incident): `Fast` bật. Phút 75 (đã hồi phục 12 phút): `Fast` **tắt** dù window 1 giờ vẫn cao, vì window 5 phút đã sạch; `Slow` vẫn bật vì window 30 phút còn chứa incident. Đây chính là tác dụng của window ngắn.
4. Lỗi rỉ rả 1%: không page, chỉ mở ticket.

Một bài học nhỏ khi viết test: ca 2 đầu tiên viết 6/600 và gọi là "0,1%", thật ra là 1%; kết quả test (alert Ticket bật) đã vạch ra lỗi tính toán của chính test. Đó là lý do cần test cho alert.

Khi chạy với traffic thật của lab (lỗi 4 đến 5%), alert `OrdersErrorBudgetBurnSlow` và `OrdersErrorBudgetBurnTicket` chuyển sang `firing` trên Prometheus (xem `GET /api/v1/alerts`), còn `Fast` chưa bật vì threshold 7,2% cao hơn mức lỗi 5%.

### Runbooks, triage, noise reduction

- Mỗi alert page có **runbook**: ý nghĩa, ảnh hưởng, cách kiểm tra đầu tiên (dashboard, câu query trace), cách mitigation (rollback, scale, bật cờ), khi nào leo thang. Alert không có runbook là alert chưa xong.
- Annotation `summary` nói **ảnh hưởng**, không chỉ nói số liệu.
- **Alertmanager** (thành phần riêng của hệ Prometheus, không có trong lab) làm grouping, deduplication, silence và **inhibit** alert phụ khi alert gốc đang bật.
- Đo chất lượng alert định kỳ: tỉ lệ page có hành động, số page/on-call shift, thời gian xử lý. Mục tiêu từ SRE book: không quá vài incident cần page trong một on-call shift.
- Tránh threshold tĩnh theo nguyên nhân: nếu cần, dùng `predict_linear` cho dung lượng (chương 10).

## 3. Trade-offs

- Multi-burn-rate chính xác nhưng phức tạp hơn threshold đơn; cần SLO rõ ràng trước. Với dịch vụ chưa có SLO, bắt đầu bằng 1 alert "error rate cao kéo dài" và một alert "latency cao", rồi tiến hóa.
- Thêm nhiều mức burn-rate: bắt được nhiều tình huống nhưng tăng số rule và khối lượng bảo trì. Workbook mô tả cả cách đặt thêm tham số; bảng 3 dòng ở trên là điểm khởi đầu hợp lý.
- Dịch vụ traffic rất thấp: một vài request lỗi làm tỉ lệ nhảy cao; cần traffic tối thiểu trong điều kiện hoặc window dài hơn, hoặc dùng probe tổng hợp (synthetic) tạo traffic đều.
- **Không dùng** page cho thứ chưa ảnh hưởng người dùng và có thể chờ tới sáng.

## 4. Pitfalls

- Chỉ dùng window dài: alert kéo dài sau khi incident đã hết.
- Chỉ dùng window ngắn: nhiễu, cháy chuông giả.
- Quên `or vector(0)`: khi không có lỗi, biểu thức trả rỗng, alert không đánh giá và không có dữ liệu cho dashboard.
- Metric lỗi bị thiếu do trùng series (chương 2): alert không bao giờ bật; kiểm chứng bằng cách gây lỗi thật và xem alert có bật.
- `for:` quá dài làm trễ phát hiện; với multi-window thường không cần `for` lớn.
- Chia alert theo từng instance thay vì theo service: hàng trăm page cho cùng một incident.
- Không test rule; sửa rule rồi không biết có còn đúng.

## 5. Summary

- Page theo triệu chứng ảnh hưởng người dùng; nguyên nhân để dashboard hoặc ticket.
- Multi-window multi-burn-rate: 14,4 (1h/5m), 6 (6h/30m), 1 (3d/6h); window ngắn = 1/12 window dài.
- Threshold error rate = burn rate × (1 − SLO); kiểm tra bằng `promtool check rules` và `promtool test rules`.
- Mỗi page cần runbook; đo chất lượng alert để chống alert fatigue.

## 6. Self-check questions

1. Phân biệt alert triệu chứng và alert nguyên nhân; cho ví dụ cho `orders-api`.
2. Với SLO 99,9%, tại sao burn rate 14,4 trong 1 giờ tương ứng đốt 2% budget tháng?
3. Vai trò của window ngắn là gì? Nếu bỏ nó thì xảy ra điều gì?
4. Tính threshold error rate của alert burn rate 6 với SLO 99,5%.
5. Vì sao cần `promtool test rules` thay vì chỉ `check rules`?

<details><summary>Answer</summary>

1. Triệu chứng: error rate `GET /order` cao. Nguyên nhân: CPU inventory cao. Page theo cái đầu.
2. 14,4 × 1 giờ / 720 giờ (30 ngày) = 0,02 = 2%.
3. Đảm bảo incident còn đang diễn ra, làm alert tắt nhanh khi hồi phục. Bỏ nó thì alert vẫn bật nhiều chục phút sau khi lỗi đã hết, vì window dài còn chứa dữ liệu xấu.
4. 6 × 0,005 = 0,03 = 3%.
5. `check` chỉ kiểm cú pháp; `test` chạy rule trên dữ liệu giả để chứng minh alert bật/tắt đúng lúc, bắt lỗi logic như nhầm tỉ lệ hoặc thiếu `or vector(0)`.
</details>
