# Chương 4. Log

## 1. Tình huống

Khách báo "đơn #8731 đặt không được". Bạn `grep` log của `orders-api` ra 40.000 dòng text tự do, mỗi dòng một kiểu, không biết dòng nào thuộc request đó, và `inventory-svc` có log riêng ở máy khác. Đồng thời hóa đơn lưu trữ log tăng gấp ba sau khi ai đó bật level DEBUG ở production. Chương này giải quyết ba vấn đề: **dễ query**, **nối được với trace**, **kiểm soát chi phí và dữ liệu nhạy cảm**.

## 2. Khái niệm

### Structured logging

Ghi mỗi event thành một bản ghi có trường (thường JSON, một dòng), thay vì câu văn.

```text
# Khó query
2026-11-08 05:09:37 ERROR order failed for sku-3: inventory failed (500)

# Có cấu trúc: lọc, nhóm, đếm theo trường
{"time":"2026-11-08T08:00:06.616103189Z","level":"ERROR","msg":"inventory failed (500)",
 "service":"orders-api","trace_id":"d2e0b9dec2892c36e766df3a58a7c3f9","span_id":"7abb77ae4d93fe53"}
```

Quy tắc: message (`msg`) là hằng số ngắn, mọi biến số đi vào trường riêng. Tên trường nhất quán (`service`, `level`, `trace_id`); nên bám semantic conventions của OTel khi có thể.

### Correlation với trace ID

Mỗi bản ghi log trong phạm vi một request mang `trace_id` và `span_id` của span đang hoạt động. Từ trace thấy span lỗi, bạn lọc log theo `trace_id` ra toàn bộ log của *đúng request đó*, ở mọi service. Mô hình log của OpenTelemetry có sẵn hai trường này; với thư viện log có sẵn, thường chỉ cần một processor/formatter chèn chúng vào. Code của lab:

```go
// lab/app/main.go: bọc slog.JSONHandler, thêm trace_id/span_id từ context
type traceHandler struct{ slog.Handler }

func (h traceHandler) Handle(ctx context.Context, r slog.Record) error {
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() { // span đang hoạt động
		r.AddAttrs(slog.String("trace_id", sc.TraceID().String()), slog.String("span_id", sc.SpanID().String()))
	}
	return h.Handler.Handle(ctx, r)
}

logger := slog.New(traceHandler{slog.NewJSONHandler(os.Stdout, nil)}).With("service", svc)
slog.ErrorContext(ctx, err.Error()) // phải truyền ctx, nếu không sẽ không có trace_id
```

(Trong file thật còn hai method `WithAttrs` và `WithGroup` để handler giữ nguyên bọc khi gọi `With`.)

Kết quả kiểm chứng trong lab: log `"msg":"inventory failed (500)"` ở `orders-api` mang `trace_id` trùng với trace thấy trong Jaeger (xem chương 12). Ngoài ra `inventory-svc` ghi log cùng `trace_id` vì nhận header `traceparent` (chương 5; log thật ở chương 12), nên một lần lọc cho ra log của cả hai service.

### Log level

| Level | Dùng cho | Production |
|---|---|---|
| ERROR | Thao tác thất bại cần chú ý | Luôn bật |
| WARN | Bất thường nhưng đã xử lý (retry thành công) | Bật |
| INFO | Mốc nghiệp vụ quan trọng (đơn được nhận) | Bật, nhưng có kiểm soát số lượng |
| DEBUG | Chi tiết để chẩn đoán | Tắt mặc định; bật tạm thời theo service hoặc theo request |

Ngoại lệ hữu ích: bật DEBUG **theo từng request** (ví dụ header `X-Debug` do nhân viên đăng nhập gửi) thay vì cho toàn hệ thống.

### Chi phí và sampling

Chi phí log ≈ số event × kích thước × thời gian lưu. Cách kiểm soát:

1. **Không ghi những gì không đọc**: log mỗi request thành công ở INFO thường dư vì trace và metric đã có.
2. **Sampling log**: giữ 100% ERROR/WARN, giữ 1 trong N bản INFO thành công. Có thể thực hiện ở app hoặc trong Collector (processor lọc/sample log).
3. **Sampling theo trace**: nếu trace được giữ thì giữ log cùng `trace_id` (cần phối hợp với tail sampling, chương 5).
4. **Phân tầng lưu trữ**: 7 ngày tìm kiếm nhanh, sau đó nén/lưu rẻ.
5. **Đặt hạn mức** theo service để một service ồn ào không nhấn chìm cả hệ thống.

### Không ghi dữ liệu nhạy cảm

Log thường được nhiều người đọc và lưu lâu: không ghi mật khẩu, token, số thẻ, CMND/CCCD, nội dung request thô. Biện pháp:

- Allowlist trường được ghi, không ghi nguyên request/response/exception kèm payload.
- Che dữ liệu ở **nguồn** (formatter), phòng thủ lớp hai bằng bộ lọc trong Collector.
- Chú ý các nơi lọt: URL có query chứa token, message exception chứa câu SQL với giá trị, header `Authorization`.
- Dữ liệu cá nhân còn chịu quy định (ví dụ Nghị định 13/2023/NĐ-CP của Việt Nam về bảo vệ dữ liệu cá nhân): coi log là nơi lưu dữ liệu cá nhân nếu có chứa.

## 3. Ví dụ thực hành

Query theo trace trong lab (log ở stdout của container, đọc bằng `docker logs`):

```bash
# lấy trace_id của một request lỗi (từ Jaeger API, chương 12), rồi
docker logs bookcheck-obsgo-orders    2>&1 | grep d2e0b9dec2892c36e766df3a58a7c3f9
docker logs bookcheck-obsgo-inventory 2>&1 | grep d2e0b9dec2892c36e766df3a58a7c3f9
```

Tìm hiểu số lượng: trong lab chỉ riêng "stock reserved" ở INFO đã sinh một dòng cho mỗi request thành công (gần 300 dòng cho 300 request). Đây là ví dụ của log "có thể bỏ" vì metric `calls_total` và trace đã chứa thông tin tương đương.

## 4. Trade-off

- **Log vs trace**: log giàu và rẻ để phát, trace cho cấu trúc nhân quả. Dùng log cho event nghiệp vụ và lỗi; dùng trace cho đường đi và latency.
- **JSON vs text**: JSON máy đọc tốt hơn nhưng khó đọc bằng mắt khi dev local: dùng formatter text ở local, JSON ở production.
- **Sampling log**: tiết kiệm nhưng có thể mất đúng dòng cần; luôn giữ lỗi và log trong trace bị giữ.
- **Gửi log qua OTel (OTLP) hay thu thập từ stdout** (agent như Fluent Bit): stdout là cách đơn giản nhất trên container; OTLP logs (Stable với Java; Go có API/SDK stable từ v1.47.0 nhưng bridge `slog` còn v0; JavaScript và Python còn Development) cho ngữ cảnh trace tự động nhưng cần SDK log. Lab dùng stdout.

## 5. Cạm bẫy

- Message có biến số trong chuỗi (`"order $id failed"`) làm không nhóm được lỗi cùng loại.
- Ghi log trong vòng lặp nóng; ghi cả stack trace cho lỗi dự kiến, lặp lại hàng nghìn lần.
- Bật DEBUG production rồi quên tắt.
- Log đa dòng (stack trace) bị tách thành nhiều bản ghi khi thu thập: dùng JSON một dòng.
- Đồng hồ lệch giữa máy làm sai thứ tự event; luôn ghi UTC, ISO 8601.
- Lộ dữ liệu nhạy cảm qua message exception.

## 6. Tóm tắt

- Log có cấu trúc, message cố định, biến số vào trường.
- `trace_id` và `span_id` trong mỗi bản ghi là cầu nối giữa log và trace.
- Kiểm soát chi phí bằng cách ghi ít hơn, sampling INFO, giữ ERROR, phân tầng lưu trữ.
- Không ghi dữ liệu nhạy cảm; che ở nguồn và lọc thêm ở Collector.

## 7. Câu hỏi tự kiểm tra

1. Vì sao message log nên là hằng số và đưa biến vào trường riêng?
2. Làm sao từ một span lỗi tìm được toàn bộ log của request đó ở mọi service?
3. Nêu 3 cách giảm chi phí log mà không mất khả năng điều tra lỗi.
4. Kể 3 nơi dữ liệu nhạy cảm hay lọt vào log mà dev ít để ý.
5. Khi nào nên bật DEBUG theo từng request thay vì toàn service?

<details><summary>Đáp án</summary>

1. Để nhóm, đếm, alert theo loại lỗi; message có biến thì mỗi dòng một chuỗi khác nhau, không gom được.
2. Lọc log theo `trace_id` của span đó; mọi service nhận traceparent đều ghi cùng ID.
3. Không ghi INFO thừa; sampling INFO thành công nhưng giữ 100% ERROR/WARN; phân tầng lưu trữ; đặt hạn mức theo service.
4. URL có query token, message exception chứa SQL kèm giá trị, header `Authorization`, body request thô.
5. Khi cần điều tra một ca cụ thể (một khách) mà không muốn tăng khối lượng log của toàn hệ thống production.
</details>
