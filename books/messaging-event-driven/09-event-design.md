# Chương 9. Thiết kế event: loại event, schema, versioning, CloudEvents, schema registry

## 1. Tình huống

Team Order thêm field, đổi `total` từ integer sang string, rồi deploy. Ba consumer của ba team khác cùng vỡ. Event là **public contract** giữa các service; thiết kế sai sẽ đắt hơn thiết kế API vì bạn không biết hết ai đang nghe, và event cũ nằm trong log hàng tuần.

## 2. Ba kiểu nội dung event

| Kiểu | Chứa gì | Ví dụ | Ưu / nhược |
|---|---|---|---|
| **Event notification** | Chỉ id và loại | `{"type":"OrderPlaced","order_id":123}` | Nhỏ, ít lộ dữ liệu; consumer phải gọi ngược API lấy chi tiết (coupling, load) |
| **Event-carried state transfer** | Đủ dữ liệu để consumer không cần hỏi lại | `OrderPlaced` kèm items, địa chỉ, tổng tiền | Consumer tự chủ, bền khi nguồn chết; payload lớn, replicate dữ liệu, khó đổi schema |
| **Delta/Fact** | Cái gì đổi | `ShippingAddressChanged{old,new}` | Gọn, rõ ý nghĩa; cần ordering |

Phân biệt thêm:
- **Domain event** (nội bộ bounded context): phản ánh mô hình domain, có thể đổi tự do, gắn với aggregate (bạn đã biết từ DDD). Có thể không bao giờ rời process.
- **Integration event** (xuyên context/service): public contract ổn định, dữ liệu tối thiểu cần thiết, không lộ cấu trúc nội bộ. Thường **dịch** từ domain event: `OrderPlaced` (domain, có entity nội bộ) → `OrderPlacedV1` (integration, DTO phẳng). Dịch ở rìa (anti-corruption), có thể chính tại bước ghi outbox.

Quy tắc đặt tên: thì quá khứ, nghiệp vụ (`OrderPlaced`, không phải `OrderRowInserted`, không phải `OrderUpdated` chung chung). Event nói điều đã xảy ra, không ra lệnh.

## 3. Envelope và CloudEvents

Mỗi message nên có metadata chuẩn: id duy nhất, loại, nguồn, thời điểm, phiên bản schema, correlation/causation id. **CloudEvents** (spec của CNCF, đã graduated) chuẩn hóa phần này. Attribute bắt buộc (v1.0): `id`, `source`, `specversion`, `type`; thường dùng thêm `time`, `datacontenttype`, `subject`, `dataschema`.

```json
{
  "specversion": "1.0",
  "id": "a6c46a5e-2b6c-4ac0-ace0-61b31f55bb08",
  "source": "/shop/orders",
  "type": "com.example.order.placed.v1",
  "time": "2026-11-08T10:15:00Z",
  "subject": "order/1",
  "datacontenttype": "application/json",
  "data": { "order_id": 1, "customer_id": "c1", "total_cents": 25000 }
}
```

`id` ở đây chính là `event_id` dùng làm dedup key của inbox (chương 6). Kafka có "binary mode" đặt attribute vào header `ce_*` và giữ `data` nguyên làm value. Lab của sách dùng envelope tối giản tự định nghĩa (`event_id`, `event_type`, `payload`) cho dễ đọc; trong dự án thật nên dùng CloudEvents.

## 4. Schema và versioning

Định nghĩa schema tường minh: JSON Schema, **Avro**, **Protobuf**. Avro/Protobuf nhỏ gọn hơn JSON và có compatibility rule rõ ràng.

**Compatibility direction** (đặt theo thứ tự deploy):
- **Backward**: consumer dùng schema *mới* đọc được dữ liệu cũ. Phổ biến khi nâng cấp consumer trước. Thêm field có default, xóa field là backward-compatible.
- **Forward**: consumer dùng schema *cũ* đọc được dữ liệu mới. Cần khi producer nâng cấp trước. Thêm field là forward-compatible, xóa field phải có default.
- **Full**: cả hai. An toàn nhất, ràng buộc chặt nhất.

Quy tắc thực dụng:
1. Chỉ **thêm optional field**; không đổi type hay nghĩa field; không đổi tên.
2. Consumer theo "tolerant reader": bỏ qua field lạ, không vỡ khi thiếu optional field.
3. Breaking change → **event type mới** (`order.placed.v2`), producer phát parallel v1 và v2 một thời gian, rồi tắt v1 khi mọi consumer đã chuyển.
4. Đừng nhét thay đổi nghĩa vào cùng tên (đổi `total` từ trước thuế sang sau thuế).
5. Với dữ liệu ghi mãi trong log (event sourcing), thêm cơ chế **upcasting**: chuyển bản cũ sang bản mới khi đọc.

## 5. Schema registry

Một service lưu schema có version, kiểm tra compatibility khi producer register schema mới, và producer chỉ gửi **schema id** (vài byte) trong message thay vì cả schema. Ví dụ: Confluent Schema Registry (hỗ trợ Avro, Protobuf, JSON Schema; compatibility mode BACKWARD mặc định, cấu hình theo subject), Apicurio Registry (mã nguồn mở), AWS Glue Schema Registry. Lợi ích: kiểm tra compatibility tại CI/lúc register thay vì phát hiện trên production. Chi phí: thêm một component phải high availability, ràng buộc serializer client. Chưa chạy trong lab; chi tiết xem tài liệu từng sản phẩm.

Khi chưa cần registry: đội nhỏ, ít consumer; có thể dùng JSON Schema trong repo chung kèm test contract (consumer-driven contract test, ví dụ Pact).

## 6. Event để làm gì thì chứa gì: lời khuyên

- Mặc định: event mang dữ liệu **đủ dùng cho 90% consumer** (state transfer vừa phải), không phải toàn bộ aggregate.
- Không đưa dữ liệu nhạy cảm (PII, thẻ) vào event sống lâu trong log; nếu cần xóa theo GDPR, cân nhắc crypto-shredding hoặc chỉ chứa id.
- Luôn có `event_id`, `occurred_at` (thời điểm nghiệp vụ xảy ra, khác thời điểm publish), `aggregate_id`, và version của aggregate nếu cần ordering.
- Size: Kafka mặc định giới hạn message ~1 MB (`message.max.bytes`); payload lớn thì lưu blob ở nơi khác và gửi reference (claim check pattern).

## 7. Cạm bẫy
- Phát event "thay đổi mọi thứ" từ DB trigger: lộ schema nội bộ, ràng buộc consumer vào bảng.
- Đặt tên theo CRUD (`OrderUpdated`) buộc consumer đoán nghĩa.
- Event chứa state nhưng không có version → không phân biệt cũ/mới khi đến out-of-order.
- Đổi schema không kiểm tra compatibility, deploy sai thứ tự.
- Dùng một event cho mọi consumer, ép thêm field riêng của từng team vào đó.

## Tóm tắt
1. Event notification nhỏ nhưng buộc gọi ngược; state transfer tự chủ nhưng nặng; chọn theo nhu cầu consumer.
2. Domain event là nội bộ; integration event là public contract, dịch ở rìa.
3. CloudEvents chuẩn hóa envelope (`id`, `source`, `specversion`, `type`...).
4. Chỉ thêm optional field; breaking change = type mới; schema registry kiểm tra compatibility tự động.

## Câu hỏi tự kiểm tra
1. Event-carried state transfer giải quyết vấn đề gì của event notification?
2. Vì sao không nên dùng domain event làm public contract?
3. Backward-compatible nghĩa là ai đọc ai?
4. Thay đổi type của `total` từ number sang string: làm thế nào an toàn?

<details><summary>Đáp án</summary>

1. Consumer không phải gọi ngược API nguồn: giảm coupling, nguồn chết vẫn chạy.
2. Nó phản ánh mô hình nội bộ thay đổi thường xuyên; mọi thay đổi sẽ phá consumer.
3. Schema mới đọc được dữ liệu cũ.
4. Phát event type/version mới (`v2`) với field mới, chạy parallel với v1 cho đến khi consumer chuyển xong.
</details>
