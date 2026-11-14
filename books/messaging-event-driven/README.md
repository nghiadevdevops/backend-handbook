# Messaging & Event-driven Architecture cho developer

Bản học tiếng Việt, viết ngày 08/11/2026. Ví dụ xuyên suốt: hệ thống đặt hàng (`orders`, `outbox`, event `OrderPlaced`).

## Ai nên đọc, cần biết gì
Developer backend (Go/TypeScript, SQL) đã nắm system design cơ bản, transaction và kiến trúc Hexagonal/DDD (domain event). Không cần biết Kafka trước.

## Mục lục
1. [Vì sao async: queue, log, pub/sub](01-why-async.md)
2. [Các sản phẩm hiện tại và bảng so sánh](02-products.md)
3. [Delivery semantics và "exactly-once"](03-delivery-semantics.md)
4. [Ordering, partition, consumer group, rebalancing](04-ordering-partitions-consumer-groups.md)
5. [Retry, backoff, DLQ, poison message, backpressure](05-retry-dlq-backpressure.md)
6. [Idempotent consumer và inbox pattern](06-idempotent-consumer-inbox.md)
7. [Transactional outbox: polling và CDC](07-transactional-outbox.md)
8. [Saga và workflow engine](08-saga.md)
9. [Thiết kế event, schema, CloudEvents, registry](09-event-design.md)
10. [Event sourcing và CQRS](10-event-sourcing-cqrs.md)
11. [Vận hành: lag, monitoring, replay, chạy parallel nhiều version](11-operations.md)
12. [Lab: outbox, inbox, retry, DLQ (output thật)](12-lab-outbox-inbox-dlq.md)

## Phiên bản đã dùng/kiểm tra (11/2026)
| Sản phẩm | Phiên bản | Trạng thái xác minh |
|---|---|---|
| Apache Kafka | 4.2.0 (17/02/2026) có share groups production-ready; lab chạy **4.3.1** (`kafka-topics.sh --version` = 4.3.1, image `apache/kafka:latest` tại thời điểm chạy) | 4.3.1 đã chạy thật; 4.2 tra qua thông báo release và bài tổng hợp |
| RabbitMQ | dòng 4.3 (4.3.5 theo trang release-information; một nguồn thứ ba nói 4.3.6) | Chưa chạy; patch chưa đối chiếu |
| NATS Server | 2.14 (29/04/2026) | Chỉ từ một bài blog bên thứ ba, chưa xác minh |
| Valkey/Redis | không xác minh phiên bản | Chỉ nói về tính năng Streams |
| PostgreSQL | 18 (`postgres:18-alpine`) | Đã chạy thật |
| Go (lab) | `golang:latest` = Go 1.27.3; `franz-go` v1.22.2, `pgx/v5` v5.12.0 (chọn franz-go vì thuần Go, không cgo, đang được maintain) | Consumer Go đã chạy thật với Kafka và PostgreSQL |
| TypeScript (lab) | `@confluentinc/kafka-javascript` 1.11.0 (GA, dựa trên librdkafka), `pg` 8.23.1, TypeScript 5.9.3; **KafkaJS không dùng** vì không còn được maintain (2.2.4, không hỗ trợ KIP-848) | Chỉ chạy `tsc --noEmit`; chưa chạy với broker (build native của librdkafka không hoàn tất trong container) |
| CloudEvents | spec 1.0 | Kiến thức cố định, không tra lại |
| Debezium, Temporal, schema registry | chỉ giới thiệu | Chưa chạy thử, cấu hình xem docs chính thức |

## Cách chạy lab
Yêu cầu: Docker và shell POSIX (Git Bash trên Windows). Không cài gì khác, không map port.

```bash
cd lab && docker compose up -d && sh scripts/setup.sh
# rồi theo các lệnh trong chương 12 (consumer Go: `lab/go/`, TypeScript: `lab/ts/`); xong thì:
docker compose down -v
```

Tên container/network có tiền tố `bookcheck-msg-`. Output thật: `lab/RESULTS.md`.

## Đọc thêm
- Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly, 2017), chương 11 "Stream Processing".
- Gregor Hohpe, Bobby Woolf, *Enterprise Integration Patterns* (Addison-Wesley, 2003).
- Ben Stopford, *Designing Event-Driven Systems* (O'Reilly, 2018).
- Chris Richardson, microservices.io: pattern "Transactional outbox" và "Saga" (https://microservices.io/patterns/).
- Tài liệu chính thức: Apache Kafka (https://kafka.apache.org/documentation/, KIP-932 cho share groups), RabbitMQ (https://www.rabbitmq.com/docs), Debezium Outbox Event Router (https://debezium.io/documentation/).
