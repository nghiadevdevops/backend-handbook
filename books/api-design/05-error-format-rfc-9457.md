# Chapter 5. Error format: RFC 9457 Problem Details

## 1. The problem

Client gọi `POST /orders`, nhận `{"error":"invalid"}`. Không biết field nào sai, có thử lại được không, đọc tài liệu ở đâu. Mỗi team lại tự chế một error format khác. **RFC 9457 "Problem Details for HTTP APIs"** (2023, thay RFC 7807) chuẩn hóa điều này với media type `application/problem+json`.

## 2. Structure

Các member chuẩn:

| Member | Ý nghĩa |
|---|---|
| `type` | URI định danh *loại* error (nên dereference được ra tài liệu). Mặc định `about:blank` |
| `title` | tóm tắt ngắn, ổn định theo `type`, đọc được bởi người |
| `status` | HTTP status code (chỉ mang tính advisory, phải khớp status thật) |
| `detail` | giải thích riêng cho *lần xảy ra này* |
| `instance` | URI định danh lần xảy ra cụ thể (hoặc request) |

Cho phép **extension member** (field tự thêm). Client phải bỏ qua extension không biết. RFC 9457 cũng định nghĩa registry cho các `type` dùng chung (HTTP Problem Types).

Response thật từ lab (đã chạy, xem `lab/transcript.md`):

```http
HTTP/1.1 412 Precondition Failed
Content-Type: application/problem+json
ETag: "..."

{"type":"https://api.example.com/problems/precondition-failed",
 "title":"ETag không khớp","status":412,
 "detail":"Order đã bị thay đổi kể từ lần bạn đọc. GET lại rồi áp dụng thay đổi lên bản mới.",
 "instance":"/orders/ord_0001"}
```

## 3. Validation errors

Chuẩn không định nghĩa sẵn danh sách error theo field, nên dùng extension `errors`. Lab dùng JSON Pointer (RFC 6901) trỏ đúng vị trí trong body:

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Dữ liệu không hợp lệ",
  "status": 422,
  "detail": "Có 2 lỗi validation.",
  "instance": "/orders",
  "errors": [
    {"pointer": "/items/0/quantity", "detail": "quantity phải là số nguyên >= 1"},
    {"pointer": "/items/0/sku", "detail": "sku bắt buộc"}
  ]
}
```

Trả **tất cả** error một lần để client sửa một lượt. Query parameter error dùng `parameter` thay `pointer`.

Machine-readable error code: dùng chính `type` (URI) làm mã. Đừng bắt client parse `title`/`detail` (có thể đổi/ dịch). Nếu cần mã ngắn, thêm extension `code`.

## 4. Rules to apply

1. Status HTTP thật phải đúng; không dùng 200 cho lỗi.
2. `Content-Type: application/problem+json` (hoặc `application/problem+xml`).
3. Mọi lỗi của API, kể cả 401/404/405/429/500, đều dùng cùng dạng (lab: hàm `problem()`).
4. Không rò chi tiết nội bộ (stack trace, SQL) vào `detail`; log kèm `trace_id` và trả `trace_id` như extension.
5. Mô tả mọi `type` trong OpenAPI (components.responses) và có trang tài liệu ở URI đó.
6. Với 429/503 thêm `Retry-After`; với 401 thêm `WWW-Authenticate`.

## 5. In Fastify/Node.js

Fastify không tự sinh Problem Details; mặc định lỗi có dạng `{statusCode, error, message}`. Cách làm trong lab (`lab/api/index.ts`): một hàm `problem()` gom `type`/`title`/`status`/`detail`/`instance` và trả `Content-Type: application/problem+json`; `setErrorHandler` bắt lỗi không lường trước và `setNotFoundHandler` bắt route lạ để mọi lỗi đều cùng định dạng. Lỗi validation từ JSON Schema (Ajv) có `instancePath` rất hợp để đổi thành `pointer` (JSON Pointer) trong mảng `errors`. Nếu muốn dùng gói có sẵn, kiểm tra mức bảo trì trước khi chọn.

## 6. Trade-offs

- `type` là URI nên cần quản lý; có thể dùng `about:blank` + `title` = tên HTTP status cho lỗi chung, nhưng mất khả năng phân biệt machine-readable.
- Quyết định có để lộ "resource tồn tại hay không" (404 vs 403) là security decision, không phải định dạng.
- Localization: `title`/`detail` có thể dịch theo `Accept-Language`, `type` thì không đổi.

## 7. Pitfalls

- `status` trong body khác status HTTP.
- `type` đổi tùy tiện, phá logic của client.
- `detail` chứa dữ liệu nhạy cảm hoặc stack trace.
- Chỉ trả error đầu tiên.
- Lỗi do proxy/gateway (HTML 502) không cùng định dạng; client cần xử lý body không phải JSON.

## 8. Summary

- RFC 9457: `type`, `title`, `status`, `detail`, `instance` + extension.
- Validation: thêm `errors` với JSON Pointer, trả đủ một lượt.
- `type` là error code ổn định cho máy; `detail` cho người.
- Dùng một format cho mọi error và khai báo trong OpenAPI.

## 9. Self-check questions

1. RFC nào thay RFC 7807?
2. Client nên dựa vào member nào để phân nhánh logic?
3. Vì sao không đặt stack trace vào `detail`?
4. Extension member lạ thì client làm gì?

<details><summary>Answer</summary>

1. RFC 9457.
2. `type` (và status HTTP), không phải `title`/`detail`.
3. Rò thông tin nội bộ, là security vulnerability.
4. Bỏ qua.
</details>
