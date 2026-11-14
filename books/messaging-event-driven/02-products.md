# Chapter 2. Current messaging products

## 1. Scenario

Team hỏi: "Dùng Kafka hay RabbitMQ hay SQS?". Câu trả lời đúng bắt đầu bằng "bạn cần mô hình nào" (chương 1) rồi mới tới sản phẩm. Chương này tóm tắt đặc tính của từng sản phẩm tại thời điểm 11/2026.

Phiên bản đã tra (nguồn ghi ở README): Kafka **4.2.0** ra 17/02/2026 (share groups production-ready); image `apache/kafka` dùng trong lab chứa `kafka-clients-4.3.1` (tức dòng 4.3 đã có). RabbitMQ dòng **4.3** (4.3.5 theo trang release-information chính thức; một trang bên thứ ba ghi 4.3.6, chưa xác minh). NATS Server **2.14** (bài viết ngày 29/04/2026, nguồn bên thứ ba, chưa đối chiếu GitHub releases). Valkey/Redis: **chưa xác minh** phiên bản mới nhất, bảng dưới chỉ nói về tính năng Streams.

## 2. The products, one by one

### Apache Kafka (distributed log)
- Từ Kafka 4.0 chỉ còn **KRaft** (không còn ZooKeeper). Node chạy role `broker`, `controller` hoặc cả hai (`process.roles=broker,controller`) như lab.
- Topic chia **partition**; ordering chỉ đảm bảo trong partition; consumer group chia partition cho consumer.
- **Share groups ("Queues for Kafka", KIP-932)**: nhiều consumer đọc **cùng một partition**, ack/release/reject **từng record**, có delivery count và lock timeout, gần với queue semantics. Theo thông báo của Kafka 4.2.0 là production-ready; 4.2 thêm ack kiểu `RENEW` (KIP-1222) và metric lag cho share group (KIP-1226). Đánh đổi: không còn đảm bảo ordering như consumer group thường.
- Mạnh: throughput, retention, replay, ecosystem (Connect, Streams, Debezium). Yếu: vận hành nặng hơn, retry/delay từng message không có sẵn ở consumer group thường.

### RabbitMQ (routing broker)
- Mô hình AMQP 0-9-1: producer gửi vào **exchange** (direct/topic/fanout/headers), exchange route vào **queue**.
- **Quorum queue** (Raft) là loại queue replicate khuyến nghị cho dữ liệu quan trọng; classic mirrored queue đã bị gỡ ở 4.0. Quorum queue có dead-letter, delivery limit để chặn poison message.
- **Streams**: log append-only, nhiều consumer đọc không xóa, offset do consumer quản lý; có protocol riêng (port 5552) hoặc đọc qua AMQP.
- Mạnh: routing linh hoạt, ack/nack/TTL/DLX từng message, latency thấp. Yếu: throughput và replay không bằng Kafka (trừ Streams).

### Amazon SQS / SNS
- **SQS standard**: at-least-once, ordering không đảm bảo, gần như không giới hạn throughput. **SQS FIFO**: ordering trong `MessageGroupId`, deduplication theo `MessageDeduplicationId` trong window 5 phút. Có visibility timeout, DLQ và redrive.
- **SNS**: pub/sub; pattern phổ biến "SNS fan-out" sang nhiều SQS queue.
- Mạnh: không vận hành. Yếu: vendor lock-in, không replay (SQS xóa sau xử lý).

### NATS and JetStream
- NATS core: pub/sub subject cực nhẹ, at-most-once, không lưu.
- **JetStream**: thêm persistence, stream và consumer (pull/push), ack, redelivery, replay, dedup theo header `Nats-Msg-Id`. Binary nhỏ, vận hành đơn giản.

### Redis / Valkey Streams
- Kiểu dữ liệu stream (`XADD`, `XREADGROUP`, `XACK`, `XPENDING`, `XAUTOCLAIM`) với consumer group và pending entries list. Phù hợp khi đã có Redis và khối lượng vừa phải; độ bền phụ thuộc cấu hình AOF/replication (có thể mất dữ liệu khi failover). Valkey là fork của Redis theo license mở, API stream tương thích.

## 3. Comparison table

| | Kafka | RabbitMQ | SQS (+SNS) | NATS JetStream | Redis/Valkey Streams |
|---|---|---|---|---|---|
| Model chính | Log (+queue qua share group) | Queue + routing; có Stream | Queue (SNS: pub/sub) | Stream + consumer | Log nhỏ + consumer group |
| Replay | Có (retention) | Chỉ với Stream | Không | Có | Có (theo độ dài stream) |
| Ordering | Trong partition | Trong queue (khi 1 consumer) | FIFO theo group | Trong stream/consumer | Trong stream |
| Ack từng message | Share group; consumer group thì commit offset | Có | Có (delete) | Có | Có (`XACK`) |
| Throughput | Rất cao | Cao | Cao (managed) | Cao | Cao (RAM) |
| Operations | Nặng | Vừa | Không | Nhẹ | Nhẹ |
| Durability | Replication, `acks=all` | Quorum queue (Raft) | Managed | Replication Raft (R3) | Phụ thuộc cấu hình |

## 4. How to choose

- Cần event log, replay, nhiều consumer độc lập, throughput lớn: **Kafka** (hoặc RabbitMQ Stream/JetStream cho quy mô nhỏ).
- Cần work queue với retry/delay/route theo rule: **RabbitMQ** hoặc **SQS**.
- Đã ở AWS và muốn khỏi vận hành: **SQS/SNS**.
- Đã có Redis, tải nhỏ, chấp nhận rủi ro về durability: **Streams**.
- Không dùng Kafka chỉ vì "ai cũng dùng". Với một job queue thông thường, Redis (Valkey), SQS hoặc chính PostgreSQL thường đủ lâu dài.

## 5. Pitfalls
- Dựa vào số phiên bản trong tài liệu cũ: hành vi thay đổi mạnh giữa Kafka 2.x, 3.x, 4.x và RabbitMQ 3.x → 4.x. Luôn đối chiếu docs đúng phiên bản.
- Dùng classic queue không replicate cho dữ liệu quan trọng.
- Dùng Pub/Sub của Redis (không lưu) cho thứ không được mất.
- Coi share group như thay thế hoàn toàn consumer group: mất ordering guarantee.

## Summary
1. Hỏi mô hình trước (queue/log/pub-sub), chọn sản phẩm sau.
2. Kafka 4.x chỉ KRaft; share groups cho Kafka queue semantics (production-ready từ 4.2).
3. RabbitMQ 4.x: quorum queue là mặc định đúng; Streams cho replay.
4. SQS/NATS/Redis Streams phù hợp bối cảnh nhỏ hoặc đã có hạ tầng.

## Self-check questions
1. KRaft thay thế component nào của Kafka?
2. Share group khác consumer group ở điểm nào về parallelism và ordering?
3. Vì sao Redis Pub/Sub không phù hợp cho event quan trọng?
4. SQS FIFO dedup trong bao lâu?

<details><summary>Answer</summary>

1. ZooKeeper (quản lý metadata); Kafka 4.0 trở đi chỉ còn KRaft.
2. Share group cho nhiều consumer đọc cùng partition, ack từng record, nhưng không đảm bảo ordering; consumer group 1 partition 1 consumer, giữ ordering.
3. Không lưu: subscriber offline hoặc chậm thì mất message.
4. Window 5 phút theo `MessageDeduplicationId`.
</details>
