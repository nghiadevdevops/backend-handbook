# Chương 6. SLI, SLO và error budget

## 1. Tình huống

Đội sản phẩm muốn ra tính năng mới mỗi tuần; đội vận hành muốn ít thay đổi để hệ thống ổn định. Mỗi lần có incident hai bên lại tranh cãi cảm tính: "hệ thống đủ tin cậy chưa?". SLO biến câu hỏi đó thành con số, và **error budget** biến sự đánh đổi giữa tốc độ ra tính năng và reliability thành một quy tắc đã thỏa thuận trước.

## 2. Khái niệm

- **SLI (Service Level Indicator)**: số đo chất lượng dịch vụ **từ góc nhìn người dùng**, thường dạng tỉ lệ `event tốt / event hợp lệ`.
- **SLO (Service Level Objective)**: mục tiêu cho SLI trong một window thời gian. Ví dụ "99,5% request `GET /order` thành công trong 30 ngày".
- **SLA (Service Level Agreement)**: cam kết có hệ quả hợp đồng (hoàn tiền) với khách hàng. SLO nội bộ nên **chặt hơn** SLA để có đệm.
- **Error budget** = `1 − SLO`: phần không-hoàn-hảo được phép. SLO 99,5% nghĩa là 0,5% request được phép lỗi. Budget là tiền tệ để "tiêu" cho rủi ro: deploy, thử nghiệm, bảo trì.

### Chọn SLI

Dạng chuẩn: `SLI = good events / valid events × 100%`.

| Loại | "Tốt" nghĩa là | Ví dụ (orders-api) |
|---|---|---|
| Availability | Request không lỗi phía server | Phản hồi không phải 5xx (loại 4xx lỗi của client khỏi tử số **và** mẫu số hoặc coi là tốt) |
| Latency | Request nhanh hơn threshold | Request < 300 ms (dựa trên histogram bucket) |
| Freshness | Dữ liệu đủ mới | Tồn kho cập nhật trong 5 phút gần nhất |
| Correctness | Kết quả đúng | Đơn tạo ra đúng giá |

Nguyên tắc: ít SLI mà đại diện được hành trình quan trọng (đặt hàng, thanh toán), không phải mọi thứ đo được. Đo càng gần người dùng càng tốt: ở load balancer hay client cho thấy cả lỗi mà server không thấy (timeout, request không tới nơi); đo ở server dễ hơn nhưng bỏ sót.

SLI trong lab đo ở span SERVER của `orders-api`, sinh bởi `span_metrics`:

```promql
# SLI lỗi: tỉ lệ request lỗi (bad / valid); SLI thành công = 1 - giá trị này
sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER",status_code="STATUS_CODE_ERROR"}[5m]))
/ sum(rate(traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m]))
```

### Cách tính error budget

Hai cách quy đổi, nên biết cả hai:

1. **Theo thời gian** (cho SLO availability thô): `budget = (1 − SLO) × window`.

   | SLO | Budget trong 30 ngày (43.200 phút) |
   |---|---|
   | 99% | 432 phút (7,2 giờ) |
   | 99,5% | 216 phút (3,6 giờ) |
   | 99,9% | 43,2 phút |
   | 99,99% | 4,32 phút |

2. **Theo event** (đúng hơn cho dịch vụ có tải thay đổi): `budget = (1 − SLO) × tổng số request hợp lệ`. Ví dụ 3 triệu request/ngày × 30 ngày = 90 triệu; SLO 99,5% cho phép 450.000 request lỗi. Mỗi giờ nửa đêm vắng khách tiêu ít budget hơn một giờ cao điểm, điều mà cách tính theo thời gian bỏ qua.

**Burn rate** (tốc độ đốt budget) = `error rate hiện tại / (1 − SLO)`. Burn rate 1 nghĩa là sẽ vừa hết budget đúng cuối window; burn rate 10 là hết sau 1/10 window (3 ngày với window 30 ngày). Chương 7 dùng burn rate để alert.

Ví dụ lab: SLO 99,5% → budget 0,005. Khi inventory cấu hình lỗi 5%, error rate đo được ≈ 0,037 đến 0,054, tức burn rate ≈ 7 đến 11, hết budget cả tháng sau khoảng 3 ngày nếu duy trì. Đó là lý do alert `OrdersErrorBudgetBurnSlow` và `...Ticket` bật trong lab (chương 12).

### Chọn SLO

- Đừng đặt 100%: không khả thi, và mọi thay đổi đều bị coi là rủi ro. Dependency của bạn (cloud, mạng, thiết bị người dùng) không tin cậy hơn thế.
- Bắt đầu từ dữ liệu thực tế (reliability hiện tại, mức khách hàng bắt đầu phàn nàn) rồi đặt mục tiêu hơi chặt hơn. SLO có thể chỉnh sau khi học thêm.
- Window: rolling 28 hoặc 30 ngày là phổ biến; calendar window (tháng) dễ báo cáo nhưng budget "reset" đột ngột.
- Mỗi hành trình quan trọng một SLO (đặt hàng, tìm kiếm), không gộp tất cả.

### Policy khi hết error budget

Error budget policy phải được **thỏa thuận trước** giữa sản phẩm, dev, vận hành và được lãnh đạo ủng hộ; nếu không nó chỉ là tờ giấy. Nội dung điển hình (tham khảo ví dụ trong SRE Workbook):

| Tình trạng | Hành động |
|---|---|
| Còn budget | Ra tính năng bình thường |
| Budget gần hết (ví dụ còn dưới 25%) | Chỉ deploy thay đổi rủi ro thấp; tăng canary, rà soát thay đổi |
| Hết budget | **Đóng băng** deploy tính năng; toàn đội ưu tiên việc reliability (sửa root cause, thêm test, cải thiện alert) cho đến khi SLI hồi phục |
| Một incident tiêu hơn ví dụ 20% budget của cả kỳ | Bắt buộc postmortem và đưa action item vào backlog ưu tiên cao |
| Hết budget vì nguyên nhân ngoài kiểm soát (dependency bên thứ ba) | Ghi nhận, thảo luận lại SLO hoặc thêm dự phòng; không phạt đội |

Giá trị lớn nhất của budget: nếu **còn dư** budget mà không dùng thì cũng là signal: có thể đội quá thận trọng, có thể làm thử nghiệm mạnh tay hơn hoặc chặt SLO hơn.

## 3. Ví dụ thực hành

Viết SLO dưới dạng bản mô tả ngắn gọn để cả đội đọc:

```text
SLO: orders-availability
SLI:  số request GET /order không lỗi 5xx / tổng request GET /order (đo tại span SERVER của orders-api)
Mục tiêu: 99,5% trong rolling window 30 ngày  → budget 0,5% (≈ 450.000 lỗi / 90 triệu request)
Alert: multi-window multi-burn-rate (chương 7); runbook: /runbooks/orders-error-budget
Policy: xem bảng trên; chủ sở hữu: đội Orders; xem lại mỗi quý
```

## 4. Trade-off

- SLO chặt: người dùng hài lòng hơn nhưng chi phí hạ tầng và tốc độ ra tính năng chịu thiệt; mỗi "9" thêm thường tốn gấp nhiều lần.
- Đo ở server: dễ, nhưng bỏ sót lỗi trước khi tới server. Đo ở client/LB: sát người dùng hơn, khó lấy hơn.
- SLO theo event công bằng với tải; theo thời gian dễ giải thích với người ngoài kỹ thuật.
- **Không dùng** SLO cho hệ thống thử nghiệm hoặc chưa có người dùng thật; cần tuần lễ dữ liệu trước khi chọn mục tiêu.

## 5. Cạm bẫy

- SLI đo thứ máy chủ thấy được (CPU) thay vì trải nghiệm người dùng.
- Đặt SLO theo "cảm giác" hoặc 99,99% khi chưa đo hiện trạng.
- Tính cả request lỗi của client (4xx do dữ liệu gửi sai) vào lỗi hệ thống, hoặc ngược lại bỏ sót lỗi nặng bị trả 200.
- Có SLO nhưng không có policy; hoặc có policy nhưng không ai tuân thủ khi hết budget.
- Dùng trung bình cho SLI latency (che đuôi chậm); dùng tỉ lệ request dưới threshold hoặc percentile.
- Với tải rất thấp, một lỗi đơn lẻ đã đốt hết budget window ngắn: cần threshold traffic tối thiểu hoặc window dài hơn.

## 6. Tóm tắt

- SLI là tỉ lệ event tốt, đo gần người dùng; SLO là mục tiêu theo window; SLA là cam kết hợp đồng, nên lỏng hơn SLO.
- Error budget = 1 − SLO; quy đổi theo thời gian (99,9% ≈ 43,2 phút/30 ngày) hoặc theo số request.
- Burn rate = error rate / budget, là nền tảng của alert (chương 7).
- Policy khi hết budget phải thỏa thuận trước và thực thi thật.

## 7. Câu hỏi tự kiểm tra

1. SLO 99,9% trong 30 ngày cho phép bao nhiêu phút ngừng hoạt động tương đương?
2. Dịch vụ 90 triệu request/tháng, SLO 99,5%: cho phép bao nhiêu request lỗi?
3. Error rate hiện tại là 3%, SLO 99,5%. Burn rate bao nhiêu và budget 30 ngày hết sau bao lâu nếu giữ nguyên?
4. Vì sao SLO nội bộ nên chặt hơn SLA?
5. Nêu hai hành động trong policy khi hết budget.

<details><summary>Đáp án</summary>

1. 0,1% × 43.200 = 43,2 phút.
2. 0,5% × 90.000.000 = 450.000.
3. Budget = 0,5%; burn rate = 3% / 0,5% = 6; hết sau 30/6 = 5 ngày.
4. Để có đệm: incident làm SLO bị phạm sẽ được phát hiện và xử lý trước khi vi phạm cam kết hợp đồng với hậu quả tài chính.
5. Đóng băng deploy tính năng, ưu tiên công việc reliability, bắt buộc postmortem với action item, siết quy trình rollout (canary).
</details>
