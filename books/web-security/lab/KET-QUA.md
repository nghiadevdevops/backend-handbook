# Kết quả chạy lab (08/11/2026)

Môi trường: Docker 29.8.1; `node:lts-alpine` (Node.js v26.13.0, npm 11.20.0); `postgres:18`; `curlimages/curl` làm client. App: Express 5.3.0, pg 8.23.1, helmet 8.3.0, zod 4.6.7 (khóa trong `app/package-lock.json`, cài bằng `npm ci`). Hai container `bookcheck-sec-app` và `bookcheck-sec-db` chạy trong network `bookcheck-sec-net`, **không map port**. Mỗi lệnh `curl` chạy từ một container khác (`docker run --rm --network bookcheck-sec-net curlimages/curl ...`). Dưới đây là request/response thật của `bash run.sh`, đã lược bớt các header không quan trọng (`Date`, `Connection`, `Keep-Alive`, `ETag`, `Content-Length`). App chạy thẳng `node server.ts` (type stripping của Node, không có bước build).

## 1. SQL injection

Request bình thường:

```
$ curl -G http://bookcheck-sec-app:8080/vuln/books --data-urlencode q=Clean
HTTP/1.1 200 OK
[{"id":1,"title":"Clean Architecture","price":30}]
```

Tấn công UNION lấy bảng `users` (endpoint lỗi, nối chuỗi vào câu SQL):

```
$ curl -G http://bookcheck-sec-app:8080/vuln/books \
    --data-urlencode "q=zzz' UNION SELECT id, password_hash, is_admin FROM users --"
HTTP/1.1 200 OK
[{"id":3,"title":"HASH-ROOT-SECRET","price":1},{"id":2,"title":"HASH-BOB-SECRET","price":0},{"id":1,"title":"HASH-ALICE-SECRET","price":0}]
```

Một dấu nháy đơn lộ lỗi SQL của PostgreSQL (thông tin để attacker dò schema):

```
$ curl -G http://bookcheck-sec-app:8080/vuln/books --data-urlencode "q='"
HTTP/1.1 500 Internal Server Error
{"error":"unterminated quoted string at or near \"'\""}
```

Cùng payload trên endpoint đã sửa (`pool.query(sql, [param])`, tham số đi riêng kênh với câu SQL): payload bị coi là chuỗi tìm kiếm, không khớp gì.

```
$ curl -G http://bookcheck-sec-app:8080/fixed/books --data-urlencode "q=zzz' UNION SELECT ... --"
HTTP/1.1 200 OK
[]
```

## 2. Stored XSS và CSP

Gửi bình luận chứa `<img src=x onerror=alert(document.domain)>` vào cả hai endpoint, rồi đọc lại. (Hai endpoint dùng chung bảng `comments`, nên trang `/fixed/comments` hiện cả hai bình luận đã gửi, mỗi bình luận một dòng.)

Bản lỗi: payload được in nguyên vào HTML, mọi người xem trang đều chạy `onerror` (curl chỉ thấy HTML, không chạy JS; browser sẽ chạy):

```
$ curl http://bookcheck-sec-app:8080/vuln/comments
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<!doctype html><html><body><h1>Binh luan</h1><ul><li><img src=x onerror=alert(document.domain)></li></ul></body></html>
```

Bản đã sửa: output encoding (`escapeHtml`) biến tag thành văn bản, **cộng** CSP (helmet) làm layer thứ hai. Các header còn lại do helmet thêm mặc định:

```
$ curl http://bookcheck-sec-app:8080/fixed/comments
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'none';script-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Content-Type: text/html; charset=utf-8

<!doctype html><html><body><h1>Binh luan</h1><ul><li>&lt;img src=x onerror=alert(document.domain)&gt;</li><li>&lt;img src=x onerror=alert(document.domain)&gt;</li></ul></body></html>
```

Ghi chú trung thực: lab dùng `curl` nên **không** quan sát việc browser chặn script do CSP; chỉ xác nhận header CSP được gửi. Muốn thấy console báo "Refused to execute inline event handler", mở bản lỗi trong browser rồi thêm header CSP vào thử (ngoài phạm vi lab này, vì không map port ra host).

## 3. IDOR / BOLA

alice (`tok-alice`, user 1) đọc đơn số 2 của bob:

```
$ curl -H "Authorization: Bearer tok-alice" http://bookcheck-sec-app:8080/vuln/orders/2
HTTP/1.1 200 OK
{"id":2,"user_id":2,"book_id":2,"note":"DIA CHI RIENG CUA BOB"}

$ curl -H "Authorization: Bearer tok-alice" http://bookcheck-sec-app:8080/fixed/orders/2
HTTP/1.1 404 Not Found
{"error":"not found"}

$ curl -H "Authorization: Bearer tok-alice" http://bookcheck-sec-app:8080/fixed/orders/1
HTTP/1.1 200 OK
{"id":1,"user_id":1,"book_id":1,"note":"giao gio hanh chinh (alice)"}
```

Bản sửa đưa điều kiện sở hữu vào chính câu truy vấn (`WHERE id = $1 AND ($3 = 1 OR user_id = $2)`), nên order của người khác không bao giờ được đọc ra khỏi DB.

## 4. Mass assignment

alice thử vào `/admin/secret` (bị từ chối), rồi gửi `{"name":"alice","is_admin":1}` tới endpoint cập nhật hồ sơ.

```
$ curl -H "Authorization: Bearer tok-alice" http://bookcheck-sec-app:8080/admin/secret
HTTP/1.1 403 Forbidden   {"error":"forbidden"}

# Bản đã sửa (zod strictObject: chỉ name, email): field lạ bị từ chối
$ curl -X POST -H "Authorization: Bearer tok-alice" -H "Content-Type: application/json" \
    -d '{"name":"alice","is_admin":1}' http://bookcheck-sec-app:8080/fixed/profile
HTTP/1.1 422 Unprocessable Entity
{"error":"invalid input","issues":[{"code":"unrecognized_keys","path":[],"message":"Unrecognized key: \"is_admin\""}]}
$ curl ... /admin/secret   ->  HTTP/1.1 403 Forbidden

# Bản lỗi: spread mọi field của req.body vào câu UPDATE
$ curl -X POST -H "Authorization: Bearer tok-alice" -H "Content-Type: application/json" \
    -d '{"name":"alice","is_admin":1}' http://bookcheck-sec-app:8080/vuln/profile
HTTP/1.1 200 OK
{"id":1,"name":"alice","email":"alice@shop.test","is_admin":1}
$ curl ... /admin/secret   ->  HTTP/1.1 200 OK  {"secret":"du lieu chi danh cho admin"}
```

(Vì lab chạy tuần tự trên cùng DB, thứ tự "sửa trước, lỗi sau" quan trọng: nếu chạy bản lỗi trước thì alice đã là admin và các bước sau không còn ý nghĩa.)

## 5. Prototype pollution

Endpoint `/legacy/panel` tạo một object rỗng rồi đọc `flags.isAdmin`; bình thường là `undefined`. Endpoint lỗi dùng hàm deep merge đệ quy không chặn khóa `__proto__`. `JSON.parse` tạo `__proto__` thành own property, nên vòng `for...in` ghi thẳng vào `Object.prototype`. Payload này phải chạy **cuối cùng**, vì nó làm bẩn cả process Node cho tới khi restart.

```
$ curl http://bookcheck-sec-app:8080/legacy/panel
HTTP/1.1 403 Forbidden   {"error":"forbidden"}

# Bản đã sửa: zod strictObject từ chối khóa __proto__
$ curl -X POST -H "Content-Type: application/json" -d '{"__proto__":{"isAdmin":true}}' http://bookcheck-sec-app:8080/fixed/settings
HTTP/1.1 422 Unprocessable Entity
{"error":"invalid input","codes":["unrecognized_keys"]}
$ curl http://bookcheck-sec-app:8080/legacy/panel
HTTP/1.1 403 Forbidden   {"error":"forbidden"}

# Bản lỗi: response trông vô hại, nhưng Object.prototype đã bị ghi
$ curl -X POST -H "Content-Type: application/json" -d '{"__proto__":{"isAdmin":true}}' http://bookcheck-sec-app:8080/vuln/settings
HTTP/1.1 200 OK
{"theme":"light","lang":"vi"}
$ curl http://bookcheck-sec-app:8080/legacy/panel
HTTP/1.1 200 OK
{"panel":"ADMIN PANEL (khong can dang nhap)"}
```

Sau một request, mọi object trong process (kể cả của request khác, người dùng khác) đều "có" `isAdmin === true`.

## 6. `npm audit`

`lab/audit/package.json` cố tình ghim phiên bản cũ: `express 4.17.1`, `jsonwebtoken 8.5.1`, `lodash 4.17.15`, `minimist 1.2.5`, `axios 0.21.1`. `audit.sh` chạy `npm install --package-lock-only` (chỉ tạo lockfile trong `/tmp` của container, không tải code về) rồi `npm audit --package-lock-only`. Exit code của `npm audit` là **1**. Đầu ra rút gọn (giữ nguyên tiêu đề package, severity, một phần advisory):

```
# npm audit report

axios  <=0.32.0
Severity: high
Axios Cross-Site Request Forgery Vulnerability - https://github.com/advisories/GHSA-wf5p-g6vw-rhxx
axios Requests Vulnerable To Possible SSRF and Credential Leakage via Absolute URL - https://github.com/advisories/GHSA-jr5f-v2jv-69x6
Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy - https://github.com/advisories/GHSA-w9j2-pvgh-6h63
... (tổng cộng 24 advisory cho axios)
fix available via `npm audit fix --force`
Will install axios@0.21.4, which is outside the stated dependency range

jsonwebtoken  <=8.5.1
Severity: high
jsonwebtoken vulnerable to signature validation bypass due to insecure default algorithm in jwt.verify() - https://github.com/advisories/GHSA-qwph-4952-7xr6
jsonwebtoken's insecure implementation of key retrieval function could lead to Forgeable Public/Private Tokens from RSA to HMAC - https://github.com/advisories/GHSA-hjrf-2m68-5959
Will install jsonwebtoken@9.0.3, which is a breaking change

lodash  <=4.17.23
Severity: high
Prototype Pollution in lodash - https://github.com/advisories/GHSA-p6mc-m468-83gw
Command Injection in lodash - https://github.com/advisories/GHSA-35jh-r3h4-6jhm
... (5 advisory)

minimist  1.0.0 - 1.2.5
Severity: critical
Prototype Pollution in minimist - https://github.com/advisories/GHSA-xvch-5gv4-984h

(còn body-parser, cookie, express, path-to-regexp, qs, send, serve-static: các lỗ hổng transitive do express 4.17.1 kéo vào)

11 vulnerabilities (3 low, 7 high, 1 critical)
```

Điểm đáng chú ý: chỉ có 5 dependency trực tiếp nhưng báo cáo có 11 package bị ảnh hưởng, vì phần lớn nằm ở dependency gián tiếp (`qs`, `path-to-regexp`, `body-parser`...). Advisory của `jsonwebtoken` 8.x (algorithm confusion) chính là lỗi nói ở chương 7; các advisory prototype pollution của `lodash`, `minimist`, `qs` cho thấy đây là lớp lỗi riêng của hệ sinh thái JavaScript. Số lượng và nội dung advisory thay đổi theo thời gian (đầu ra là của ngày chạy).

## 7. Dọn dẹp

`run.sh` dùng `trap` để xóa container `bookcheck-sec-app`, `bookcheck-sec-db` và network `bookcheck-sec-net` khi kết thúc. Sau lần chạy: `docker ps -a` và `docker network ls` không còn tên `bookcheck-sec-*`. Không tạo volume; `node_modules` nằm trong `/srv` của container (thư mục `lab/app` mount read-only) nên không để lại gì trên host.
