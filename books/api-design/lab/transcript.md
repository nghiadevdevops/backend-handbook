## 1. Thiếu Idempotency-Key -> 400

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -d {"items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}]}
HTTP/1.1 400 Bad Request
content-type: application/problem+json; charset=utf-8
content-length: 195
Date: Sun, 08 Nov 2026 08:02:35 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/idempotency-key-missing","title":"Thiếu Idempotency-Key","status":400,"detail":"POST /orders yêu cầu header Idempotency-Key.","instance":"/orders"}

## 2. Validation lỗi -> 422 (RFC 9457 + errors[])

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: k-bad -d {"items":[{"quantity":0,"unit_price":10}]}
HTTP/1.1 422 Unprocessable Content
content-type: application/problem+json; charset=utf-8
content-length: 317
Date: Sun, 08 Nov 2026 08:02:41 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/validation-error","title":"Dữ liệu không hợp lệ","status":422,"detail":"Có 2 lỗi validation.","instance":"/orders","errors":[{"pointer":"/items/0/sku","detail":"sku bắt buộc"},{"pointer":"/items/0/quantity","detail":"quantity phải là số nguyên >= 1"}]}

## 3. Tạo đơn lần đầu -> 201 + ETag + Location

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: key-0001 -d {"items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"note":"giao gio hanh chinh"}
HTTP/1.1 201 Created
location: /orders/ord_0001
etag: "055f116e02d2980e"
content-type: application/json; charset=utf-8
content-length: 193
Date: Sun, 08 Nov 2026 08:02:46 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0001","status":"pending","note":"giao gio hanh chinh","items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"total":300000,"version":1,"created_at":"2026-11-08T08:02:46.502Z"}

## 4. Gửi lại cùng key + cùng body -> phát lại 201, không tạo đơn mới

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: key-0001 -d {"items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"note":"giao gio hanh chinh"}
HTTP/1.1 201 Created
location: /orders/ord_0001
etag: "055f116e02d2980e"
idempotent-replayed: true
content-type: application/json; charset=utf-8
content-length: 193
Date: Sun, 08 Nov 2026 08:02:53 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0001","status":"pending","note":"giao gio hanh chinh","items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"total":300000,"version":1,"created_at":"2026-11-08T08:02:46.502Z"}

## 5. Cùng key, body khác -> 422

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: key-0001 -d {"items":[{"sku":"BOOK-9","quantity":1,"unit_price":1}]}
HTTP/1.1 422 Unprocessable Content
content-type: application/problem+json; charset=utf-8
content-length: 205
Date: Sun, 08 Nov 2026 08:02:59 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/idempotency-key-reused","title":"Idempotency-Key bị dùng lại","status":422,"detail":"Key này đã được dùng với payload khác.","instance":"/orders"}

## 6. Race: 2 request cùng key, request đầu bị giữ 2 giây -> request sau nhận 409

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: key-race -d {"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}]}
HTTP/1.1 409 Conflict
retry-after: 1
content-type: application/problem+json; charset=utf-8
content-length: 200
Date: Sun, 08 Nov 2026 08:03:07 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/request-in-progress","title":"Request đang xử lý","status":409,"detail":"Request gốc với key này chưa xong; thử lại sau.","instance":"/orders"}

(response của request đầu)

$ curl -X POST http://bookcheck-apits-server:8080/orders -H Content-Type: application/json -H Idempotency-Key: key-race -H X-Demo-Delay: 2 -d {"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}]}
HTTP/1.1 201 Created
location: /orders/ord_0002
etag: "5917862e52248863"
content-type: application/json; charset=utf-8
content-length: 171
Date: Sun, 08 Nov 2026 08:03:08 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0002","status":"pending","note":null,"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}],"total":5000,"version":1,"created_at":"2026-11-08T08:03:08.906Z"}

## 7. Đọc đơn -> ETag

$ curl http://bookcheck-apits-server:8080/orders/ord_0001
HTTP/1.1 200 OK
etag: "055f116e02d2980e"
cache-control: private, max-age=0, must-revalidate
content-type: application/json; charset=utf-8
content-length: 193
Date: Sun, 08 Nov 2026 08:03:16 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0001","status":"pending","note":"giao gio hanh chinh","items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"total":300000,"version":1,"created_at":"2026-11-08T08:02:46.502Z"}

## 8. GET có If-None-Match -> 304

$ curl http://bookcheck-apits-server:8080/orders/ord_0001 -H If-None-Match: "055f116e02d2980e"
HTTP/1.1 304 Not Modified
etag: "055f116e02d2980e"
Date: Sun, 08 Nov 2026 08:03:26 GMT
Connection: keep-alive
Keep-Alive: timeout=72


## 9. PATCH thiếu If-Match -> 428

$ curl -X PATCH http://bookcheck-apits-server:8080/orders/ord_0001 -H Content-Type: application/json -d {"note":"A sua"}
HTTP/1.1 428 Precondition Required
content-type: application/problem+json; charset=utf-8
content-length: 211
Date: Sun, 08 Nov 2026 08:03:31 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/precondition-required","title":"Cần If-Match","status":428,"detail":"PATCH yêu cầu If-Match với ETag lấy từ GET gần nhất.","instance":"/orders/ord_0001"}

## 10. PATCH đúng If-Match -> 200, ETag mới

$ curl -X PATCH http://bookcheck-apits-server:8080/orders/ord_0001 -H Content-Type: application/json -H If-Match: "055f116e02d2980e" -d {"note":"A sua"}
HTTP/1.1 200 OK
etag: "4794aeffec3a2362"
content-type: application/json; charset=utf-8
content-length: 179
Date: Sun, 08 Nov 2026 08:03:37 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0001","status":"pending","note":"A sua","items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"total":300000,"version":2,"created_at":"2026-11-08T08:02:46.502Z"}

## 11. PATCH với ETag cũ (client B) -> 412 lost update bị chặn

$ curl -X PATCH http://bookcheck-apits-server:8080/orders/ord_0001 -H Content-Type: application/json -H If-Match: "055f116e02d2980e" -d {"note":"B sua"}
HTTP/1.1 412 Precondition Failed
etag: "4794aeffec3a2362"
content-type: application/problem+json; charset=utf-8
content-length: 262
Date: Sun, 08 Nov 2026 08:03:44 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/precondition-failed","title":"ETag không khớp","status":412,"detail":"Order đã bị thay đổi kể từ lần bạn đọc. GET lại rồi áp dụng thay đổi lên bản mới.","instance":"/orders/ord_0001"}

## 12. Phân trang cursor: limit=1

$ curl http://bookcheck-apits-server:8080/orders?limit=1
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 218
Date: Sun, 08 Nov 2026 08:03:49 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"data":[{"id":"ord_0001","status":"pending","note":"A sua","items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"total":300000,"version":2,"created_at":"2026-11-08T08:02:46.502Z"}],"next_cursor":"b3JkXzAwMDE"}

## 13. Trang kế (cursor lấy từ next_cursor ở trên)

$ curl http://bookcheck-apits-server:8080/orders?limit=1&cursor=b3JkXzAwMDE
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 201
Date: Sun, 08 Nov 2026 08:04:00 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"data":[{"id":"ord_0002","status":"pending","note":null,"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}],"total":5000,"version":1,"created_at":"2026-11-08T08:03:08.906Z"}],"next_cursor":null}

## 14. Cursor sai -> 400

$ curl http://bookcheck-apits-server:8080/orders?cursor=%%%
HTTP/1.1 400 Bad Request
content-type: application/problem+json; charset=utf-8
content-length: 190
Date: Sun, 08 Nov 2026 08:04:06 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"type":"https://api.example.com/problems/invalid-cursor","title":"Cursor không hợp lệ","status":400,"detail":"Cursor sai định dạng hoặc đã hết hạn.","instance":"/orders"}

## 15. Hủy đơn (action) 2 lần: lần 2 vẫn 200 (idempotent)

$ curl -X POST http://bookcheck-apits-server:8080/orders/ord_0002/cancel
HTTP/1.1 200 OK
etag: "617547743f6d98b3"
content-type: application/json; charset=utf-8
content-length: 173
Date: Sun, 08 Nov 2026 08:04:15 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0002","status":"cancelled","note":null,"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}],"total":5000,"version":2,"created_at":"2026-11-08T08:03:08.906Z"}

$ curl -X POST http://bookcheck-apits-server:8080/orders/ord_0002/cancel
HTTP/1.1 200 OK
etag: "617547743f6d98b3"
content-type: application/json; charset=utf-8
content-length: 173
Date: Sun, 08 Nov 2026 08:04:20 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"id":"ord_0002","status":"cancelled","note":null,"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}],"total":5000,"version":2,"created_at":"2026-11-08T08:03:08.906Z"}
