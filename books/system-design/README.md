# System Design: bản học viết lại (tiếng Việt)

**Ngày cập nhật: 2026-11-07.** Bản tự học dựa trên dàn ý của ebook "System Design" (tác giả Huy), được viết lại bằng lời mới, sửa các sai sót đã biết và cập nhật theo tình hình hiện tại (SLA, sản phẩm, chuẩn giao thức).

## Mục lục

1. [Phỏng vấn System Design: bản chất và khung trả lời](01-system-design-interview.md)
2. [Khái niệm nền tảng và các con số cần thuộc](02-fundamentals-and-numbers.md) (bảng số 9, MTBF/MTTR, SLA vs design availability, bảng latency, estimation)
3. [Các thành phần phổ biến trong hệ thống](03-common-components.md)
4. [Consistency và availability: replication, quorum, CAP, PACELC](04-consistency-and-availability.md)
5. [Database: chọn loại, sharding, index, transaction, locking](05-databases.md)
6. [Load Balancer và Caching](06-load-balancing-and-caching.md)
7. [Message Queue, delivery semantics và idempotency](07-message-queues-delivery-semantics.md) (outbox, idempotent consumer)
8. [Giao thức và thiết kế API](08-protocols-and-api-design.md) (TCP/UDP/QUIC, REST, status code, idempotent method)
9. [Fault tolerance và recovery](09-fault-tolerance-and-recovery.md) (retry + backoff + jitter, circuit breaker, rate limiting, HA)
10. [Security và authorization](10-security-and-authorization.md)
11. [Monitoring và Observability (OpenTelemetry)](11-monitoring-and-observability.md)
12. [Ba bài thiết kế mẫu](12-design-case-studies.md) (URL shortener, news feed, chat)

## Cách đọc

- **Lần đầu**: đọc 1 → 2 → 3, rồi 4 → 5 (nặng lý thuyết nhất), sau đó 6 → 11 tùy nhu cầu, cuối cùng làm chương 12.
- **Ôn gấp trước phỏng vấn**: chương 1 (khung), mục "Khi phỏng vấn nên nói gì" và "Tóm tắt" của từng chương, bảng số ở chương 2, rồi tự làm lại một bài ở chương 12 trên giấy.
- Mỗi chương theo cùng cấu trúc: giải thích → ví dụ thiết kế → trade-off → nên nói gì khi phỏng vấn → cạm bẫy → tóm tắt → câu hỏi tự kiểm tra (đáp án trong thẻ `<details>` cuối file; hãy tự trả lời trước khi mở).
- Sơ đồ dùng Mermaid; xem được trong GitHub, VS Code (có extension), Obsidian.
- Các con số trong bài tập thiết kế là **giả định**; phép tính được ghi rõ để bạn kiểm lại.

## Lưu ý về độ tươi của thông tin

SLA, phiên bản và giấy phép sản phẩm thay đổi nhanh. Các con số và trạng thái trong sách được tra ngày 2026-11-07 (nguồn ghi cuối mỗi chương). Trước khi trích dẫn trong tình huống quan trọng, hãy tra lại trang chính thức.
