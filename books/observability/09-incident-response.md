# Chương 9. Quy trình xử lý incident

## 1. Tình huống

Alert `OrdersErrorBudgetBurnFast` kêu lúc 14:12. Năm kỹ sư cùng vào kênh chat, ba người cùng restart service, hai người cùng thử rollback hai phiên bản khác nhau, không ai báo cho bộ phận chăm sóc khách hàng. 40 phút sau hệ thống ổn lại nhưng không ai biết do thay đổi nào. Vấn đề không nằm ở kỹ thuật mà ở **tổ chức khi incident**: ai quyết định, ai thao tác, ai nói chuyện với bên ngoài.

## 2. Khái niệm

### Vòng đời incident

```
Detect (alert) → Triage & declare → Mitigate → Resolve → Postmortem → Corrective action
      ▲                                                                                      │
      └──────────────────────────  cải thiện alert, runbook, thiết kế  ◄──────────────────────┘
```

Thứ tự ưu tiên: **mitigate ảnh hưởng trước, tìm root cause sau**. Rollback, tắt feature flag, chuyển tải thường nhanh hơn chẩn đoán đầy đủ. Hỏi "thay đổi gì gần đây?" luôn là bước đầu (annotation deploy ở chương 8).

### Declare sớm

Theo chương "Managing Incidents" của SRE book, nên **declare incident sớm và đóng sớm** còn hơn bắt đầu khung xử lý sau nhiều giờ. Gợi ý của sách cho thời điểm declare: cần đội thứ hai tham gia; người dùng nhìn thấy incident; hoặc vấn đề chưa giải được sau một giờ phân tích tập trung. Khai báo không phải thừa nhận thất bại.

### Roles

Khung theo Incident Command System, mô tả trong SRE book:

| Vai trò | Trách nhiệm |
|---|---|
| **Incident Commander (IC)** | Nắm bức tranh tổng thể, chia vai trò, ra quyết định, gỡ vướng. Vai trò nào chưa giao thì IC giữ. IC **không** tự gõ lệnh sửa lỗi. |
| **Operations lead** | Thao tác lên hệ thống. Nguyên tắc: **chỉ nhóm Ops được thay đổi hệ thống** trong incident, để tránh thay đổi chồng chéo. |
| **Communications lead** | Mặt trước với bên ngoài và nội bộ: cập nhật định kỳ cho stakeholder, khách hàng, hỗ trợ; có thể giữ tài liệu incident. |
| **Planning lead** | Việc dài hơi: mở bug, sắp xếp bàn giao, theo dõi những gì đã chệch khỏi trạng thái bình thường để hoàn trả. |
| Subject-matter experts | Chuyên gia hệ thống liên quan, được IC gọi vào. |

Đội nhỏ có thể một người giữ nhiều vai, nhưng **IC phải được chỉ định rõ ràng bằng tên**. Bàn giao IC (khi hết ca) phải tường minh: người cũ ở lại đến khi người mới xác nhận tiếp nhận.

### Severity

Mỗi tổ chức tự định nghĩa; ví dụ minh họa:

| Mức | Mô tả | Phản ứng |
|---|---|---|
| SEV1 | Ngừng dịch vụ hoặc mất dữ liệu, khách hàng ảnh hưởng rộng | Page ngay, IC chính thức, cập nhật mỗi 30 phút |
| SEV2 | Suy giảm đáng kể, có cách tạm | Page, cập nhật mỗi 1 giờ |
| SEV3 | Ảnh hưởng nhỏ | Xử lý giờ hành chính |

(Cách chia SEV và tần suất cập nhật là ví dụ, không phải chuẩn.)

### Communication

- Một **kênh chung** (chat) cho incident và một **tài liệu trạng thái sống**: ai đang làm gì, giả thuyết, mốc thời gian, quyết định; thông tin quan trọng nhất ở đầu. Tài liệu này là nguyên liệu cho postmortem.
- Cập nhật định kỳ theo nhịp cam kết, ngay cả khi "chưa có gì mới".
- Mẫu cập nhật ngắn: *Ảnh hưởng hiện tại, Điều đã biết, Đang làm gì, Lần cập nhật kế tiếp*.
- Phân biệt kênh kỹ thuật (nhiều chi tiết) và kênh thông báo ngoài (ngắn, không suy đoán nguyên nhân).

### Postmortem không đổ lỗi (blameless)

Sau incident đáng kể, viết **postmortem** để *học*, không để quy trách nhiệm. Nguyên tắc blameless: con người làm việc với thông tin và công cụ họ có; nếu một người sai mà hệ thống để sai gây hậu quả lớn, **hệ thống** cần sửa (quyền, kiểm tra, tự động hóa). Đổ lỗi khiến người ta giấu thông tin, và lần sau bạn mất dữ liệu quan trọng nhất.

Khung postmortem (rút gọn):

```text
Tóm tắt: 1-2 câu, ảnh hưởng (bao nhiêu người, bao lâu, bao nhiêu error budget)
Mốc thời gian (UTC): detect, declare, mitigate, resolve
Ảnh hưởng: số liệu từ SLI (không cảm tính)
Nguyên nhân gốc và yếu tố góp phần: nhiều tầng, "5 lần tại sao"
Điều đã làm tốt / điều may mắn / điều chưa tốt
Phát hiện: sao alert không bắt sớm hơn? Dữ liệu observability có đủ không?
Hành động: mỗi việc có người sở hữu, hạn, mức ưu tiên; liên kết error budget policy
```

Chú ý mục "dữ liệu observability có đủ không": mỗi postmortem nên dẫn tới ít nhất một cải tiến về alert, runbook, hoặc signal.

## 3. Ví dụ: incident trong lab

Chạy lab với `ERROR_RATE=0.05` ở inventory mô phỏng một incident âm ỉ:

1. **Phát hiện**: Prometheus báo `OrdersErrorBudgetBurnSlow` firing (chương 7).
2. **Declare**: một người nhận vai IC, ghi vào tài liệu "04:35 UTC, orders-api lỗi ~5%".
3. **Khoanh vùng** bằng trace: lọc `http.response.status_code=502` ra trace; trong cây span, span lỗi nằm ở `inventory-svc GET /reserve`; log cùng `trace_id` ghi "stock backend unavailable" (chương 4, chương 12).
4. **Mitigate**: trong tình huống thật có thể rollback phiên bản inventory hoặc trỏ sang replica; trong lab sẽ đặt `ERROR_RATE=0` rồi `docker compose up -d`.
5. **Postmortem**: ghi ảnh hưởng bằng SLI (error rate ≈ 5% trong N phút, burn rate ≈ 10), và hành động (alert theo dependency, circuit breaker/retry cho gọi inventory).

## 4. Trade-off

- Quy trình nặng (nhiều vai) cho SEV1, nhẹ hơn cho incident nhỏ; quy trình quá nặng khiến người ta né declare.
- Mitigate nhanh bằng rollback có thể che mất nguyên nhân; thu thập bằng chứng (trace, log mẫu) trước khi xóa trạng thái, nếu không tốn thêm thời gian ảnh hưởng.
- Postmortem cho mọi incident tốn thời gian; áp dụng cho incident vượt threshold (ví dụ tiêu đáng kể error budget, SEV1/2, gần suýt xảy ra).
- **Không dùng** blameless như cớ để bỏ qua trách nhiệm: blameless nghĩa là "không phạt người", không có nghĩa là "không cần sửa gì".

## 5. Cạm bẫy

- Nhiều người cùng sửa hệ thống, thay đổi chồng chéo; không ai biết trạng thái.
- IC lao vào gõ lệnh, mất bức tranh chung.
- Chẩn đoán root cause khi chưa mitigate.
- Không có cập nhật định kỳ cho bên ngoài: hỗ trợ khách hàng mù thông tin.
- Postmortem viết xong rồi bỏ: action item không có chủ, không hạn.
- Dùng từ đổ lỗi ("do anh A quên") thay vì mô tả cơ chế ("quy trình không kiểm tra phiên bản trước khi deploy").
- Hành động sửa là "cố gắng cẩn thận hơn": không phải hành động có thể kiểm chứng.

## 6. Tóm tắt

- Mitigate trước, tìm root cause sau; declare sớm.
- Vai trò rõ ràng: IC điều phối, Ops thao tác, Comms giao tiếp, Planning lo việc dài hơi; chỉ Ops chạm vào hệ thống.
- Kênh chung và tài liệu trạng thái sống; cập nhật định kỳ.
- Postmortem blameless: sửa hệ thống, mỗi hành động có chủ và hạn.

## 7. Câu hỏi tự kiểm tra

1. Vì sao IC không nên tự tay sửa lỗi?
2. Vì sao chỉ nhóm Ops được thay đổi hệ thống trong incident?
3. Hai điều kiện (theo SRE book) nên declare incident ngay.
4. Postmortem blameless khác postmortem đổ lỗi ở điểm nào về kết quả?
5. Một action item tốt có những đặc điểm nào?

<details><summary>Đáp án</summary>

1. IC cần giữ bức tranh tổng thể và điều phối; tự gõ lệnh làm mất khả năng quan sát toàn cục và ra quyết định.
2. Tránh những thay đổi chồng chéo, khó truy ngược, làm xấu thêm tình hình và khó viết postmortem.
3. Cần đội thứ hai tham gia; incident nhìn thấy bởi khách hàng; hoặc chưa giải được sau một giờ phân tích tập trung.
4. Blameless khuyến khích nói thật nên có đủ dữ liệu, dẫn tới sửa hệ thống; đổ lỗi khiến giấu thông tin và lặp lại incident.
5. Có người sở hữu, hạn, mức ưu tiên, kiểm chứng được (cụ thể, đo được), gắn với nguyên nhân hoặc yếu tố góp phần.
</details>
