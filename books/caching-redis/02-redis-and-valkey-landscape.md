# Chapter 2. Redis and Valkey: the 2026 landscape

## 1. The problem

Bạn đọc tài liệu cũ, thấy "Redis là BSD, miễn phí cho mọi mục đích". Rồi cloud provider đưa ra "Valkey", còn Redis lại nói "đã mở nguồn trở lại". Chọn cái nào cho dự án? Có tương thích không? Chương này tóm tắt bối cảnh để bạn quyết định có cơ sở. Các số phiên bản dưới đây tra ngày 07-08/11/2026 trên trang releases của GitHub và Docker Hub.

## 2. License timeline

| Mốc | Sự kiện |
|---|---|
| đến Redis 7.2.x | Redis theo BSD 3-clause |
| 03/2024 (từ Redis 7.4) | Redis Ltd. chuyển sang dual license **RSALv2** hoặc **SSPLv1**; cả hai đều không được OSI công nhận là open source |
| 03/2024 | Cộng đồng và các hãng (AWS, Google, Oracle, Ericsson...) lập **Valkey** dưới Linux Foundation, fork từ Redis 7.2.4, giữ BSD 3-clause |
| 05/2025 (Redis 8.0) | Redis Ltd. thêm **AGPLv3** làm lựa chọn thứ ba. Người dùng chọn một trong RSALv2, SSPLv1, AGPLv3 |

Trang license chính thức của Redis (redis.io/legal/licenses) nói AGPLv3 là một lựa chọn thêm cho Redis Open Source từ Redis 8 và hãng dự định giữ nó. Hệ quả thực tế: nếu bạn chỉ **dùng** Redis như một dịch vụ nội bộ cho ứng dụng của mình thì ràng buộc license thường không phát sinh; nếu bạn **cung cấp Redis như dịch vụ** cho bên thứ ba, hoặc **sửa mã nguồn Redis và cho người khác truy cập qua mạng**, hãy đọc kỹ AGPLv3/SSPLv1 và hỏi pháp chế. Cuốn sách này không phải tư vấn pháp lý.

## 3. Current versions (checked 11/2026)

| Sản phẩm | Bản ổn định mới nhất | Ghi chú |
|---|---|---|
| Valkey | **9.1.3** (26/10/2026) | 9.2.0-rc2 ra 04/11/2026; còn các nhánh vá 9.0.7, 8.1.11, 8.0.12, 7.2.15 |
| Redis | **8.10.3** (26/10/2026) | 8.12 RC2 (01/11/2026) là pre-release; còn các nhánh vá 8.8.4, 8.6.8, 8.4.8, 8.2.11, 7.4.12, 7.2.17 |

Cả hai đều ra bản vá bảo mật ngày 26/10/2026, nhắc ta rằng **phải cập nhật bản vá** và không để Redis/Valkey mở ra Internet. Lab của cuốn này dùng image `valkey/valkey:9.1.3-alpine` và `redis:8.10.3-alpine`.

## 4. Key differences

Hai bên chia tay từ nhánh 7.2 nên lệnh nền tảng (string, hash, list, set, zset, stream, pub/sub, Lua, Functions, ACL, Cluster, Sentinel) **tương thích rất cao**. Client Go (`valkey-go`, `go-redis`) và Node (`ioredis`, `node-redis`) dùng được cho cả hai. Khác biệt nằm ở phần mới:

| Chủ đề | Redis 8.x | Valkey 8.x/9.x |
|---|---|---|
| License | RSALv2 / SSPLv1 / AGPLv3 (chọn một) | BSD 3-clause |
| Module chuẩn | JSON, Search/Query Engine (vector), Time Series, probabilistic (Bloom...) và Vector Sets được gộp vào bản phân phối Redis 8 | Mở rộng qua module riêng (valkey-json, valkey-search, valkey-bloom) và các bản bundle; không nằm trong lõi |
| Hash field expiration | Có từ 7.4 (`HEXPIRE`...) | Có từ 9.0 (cú pháp tương tự, chi tiết có khác biệt nhỏ, kiểm tra docs) |
| Cluster | Slot migration kiểu cũ (từng key) | 9.0 có atomic slot migration (di chuyển cả slot), và multi-database trong cluster mode |
| Multi-threaded I/O | Có từ 6.0, cải tiến ở 8.0 | Viết lại I/O threading ở 8.0, tiếp tục cải tiến ở 8.1/9.x |
| Hiệu năng/bộ nhớ | Có tối ưu riêng | 8.1 có hash table mới tiết kiệm bộ nhớ; 9.1 tiếp tục giảm overhead (blog Valkey 08/2026) |

> Chưa xác minh: danh sách đầy đủ các lệnh chỉ có ở một bên thay đổi theo từng bản nhỏ. Trước khi dùng lệnh "mới" (ví dụ lệnh set có điều kiện mới), hãy chạy `COMMAND INFO <tên>` trên đúng server của bạn. Ở lab chương 9 mình có thử một lệnh như vậy.

## 5. Which one to choose?

- **Dịch vụ managed của cloud** (ElastiCache, Memorystore, Azure Cache...): theo những gì nhà cung cấp hỗ trợ; nhiều nhà cung cấp lớn đã có Valkey, thường rẻ hơn. Kiểm tra bảng giá hiện hành.
- **Tự host, cần JSON/vector/time series trong cùng một server**: Redis 8 có sẵn.
- **Cần license BSD thuần, hoặc không muốn rủi ro pháp lý**: Valkey.
- **Chỉ cần cache và lock như cuốn sách này**: cả hai đều đủ. Code ứng dụng giữ ở tập lệnh chung để đổi được qua lại.

## 6. Writing vendor-neutral code

- Dùng client nói giao thức RESP (`valkey-go`, `go-redis`, `ioredis`); đừng dựa vào lệnh chỉ có ở một bên khi không cần.
- Cấu hình hai bên qua biến môi trường (ví dụ `CACHE_ADDR`); cùng một client nói chuyện được với cả hai.
- Có integration test chạy trên cả hai image trong CI (compose của `lab/` làm đúng việc này).

## 7. Pitfalls

- Nhầm "Redis không còn mở" thành "không dùng được": từ Redis 8 đã có AGPLv3. Ngược lại, không giả định mọi tài liệu Redis cũ đúng cho Valkey.
- Dùng image tag `latest` trong production: khó tái lập; ghim phiên bản đến minor/patch.
- Bỏ qua bản vá bảo mật: cả hai hãng vừa vá lỗi nghiêm trọng vào 26/10/2026.

## 8. Summary

- Redis đổi license 03/2024; Valkey (Linux Foundation, BSD) fork từ 7.2.4; Redis thêm AGPLv3 từ 8.0 (05/2025).
- Tháng 11/2026: Valkey 9.1.3 và Redis 8.10.3 là bản ổn định mới nhất.
- Lõi lệnh tương thích; khác ở module (JSON, vector, search), cluster và tối ưu nội bộ.
- Chọn theo license, nhu cầu module và dịch vụ managed; viết code ở tập lệnh chung.

## 9. Self-check questions

1. Valkey fork từ phiên bản Redis nào và thuộc tổ chức nào?
2. Redis 8 dùng những license nào?
3. Vì sao code cache của cuốn sách chạy được trên cả hai?
4. Làm sao biết một lệnh có tồn tại trên server đang chạy?
5. Nêu một lý do chọn Redis 8 và một lý do chọn Valkey.

<details><summary>Answer</summary>

1. Redis 7.2.4; Linux Foundation.
2. RSALv2, SSPLv1 hoặc AGPLv3 (chọn một).
3. Chỉ dùng tập lệnh lõi (string, hash, zset, Lua, `SET NX PX`...) vốn tương thích từ nhánh 7.2.
4. `COMMAND INFO <tên>` hoặc `COMMAND DOCS`, và đối chiếu `INFO server`.
5. Redis 8: có JSON/vector/time series trong bản phân phối. Valkey: license BSD, được nhiều cloud hỗ trợ.

</details>
