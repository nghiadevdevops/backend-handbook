# Chapter 11. Operations: consumer lag, monitoring, replay, running multiple versions in parallel

## 1. Scenario

Thứ Hai, email xác nhận chậm 3 tiếng. Không có exception nào, mọi service "xanh". Nguyên nhân: consumer chậm hơn tốc độ vào, backlog tích tụ qua cuối tuần. Hệ thống async **thất bại âm thầm**: lỗi hiện ra dưới dạng "chậm" chứ không phải "gãy". Vì vậy monitoring là một phần của thiết kế, không phải thứ thêm sau.

## 2. Consumer lag

**Lag** = (offset mới nhất của partition) − (offset consumer group đã commit). Là số message còn chờ. Xem bằng CLI:

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group inventory
# cột: TOPIC PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG ...
```

Lag tuyệt đối ít ý nghĩa bằng **xu hướng** và **thời gian chờ** (time lag: tuổi của message cũ nhất chưa xử lý). Lag 10 000 mà đang giảm thì ổn; lag 100 mà tăng đều thì hỏng. Share group (Kafka 4.2+) có metric lag riêng (KIP-1226). RabbitMQ: `messages_ready` và `messages_unacknowledged` của queue; SQS: `ApproximateNumberOfMessagesVisible` và `ApproximateAgeOfOldestMessage`.

## 3. What to monitor (minimum)

| Layer | Metric | Alert khi |
|---|---|---|
| Consumer | Lag / tuổi message cũ nhất | tăng liên tục hoặc vượt SLO (ví dụ >5 phút) |
| Consumer | Error rate, số lần retry | tăng đột biến |
| Consumer | Processing time (p95/p99) | gần `max.poll.interval.ms` |
| DLQ | Số message | > 0 |
| Broker | Under-replicated partitions, offline partitions, disk, ISR shrink | khác 0 / sắp đầy |
| Outbox | Số dòng chưa gửi, tuổi dòng cũ nhất | tăng (publisher chết) |
| Rebalance | Số lần rebalance/giờ | nhiều bất thường |

Công cụ: Kafka expose JMX (dùng exporter cho Prometheus), Burrow/kafka-lag-exporter cho lag; RabbitMQ có plugin Prometheus tích hợp; CloudWatch cho SQS. Thêm **distributed tracing**: truyền `traceparent` (W3C Trace Context) trong header message để thấy một request đi qua broker; cùng correlation id trong log.

Mẹo outbox: query đơn giản `SELECT count(*), min(created_at) FROM outbox WHERE published_at IS NULL` là health metric của cả đường publish.

## 4. Replay

Với log (Kafka), replay là tính năng, nhưng nguy hiểm nếu không chuẩn bị:

- Đặt lại offset: `kafka-consumer-groups.sh --group G --topic orders --reset-offsets --to-earliest --execute` (group phải **inactive**; thêm `--dry-run` trước; còn `--to-datetime`, `--shift-by`).
- Replay = redeliver message cũ → consumer **phải idempotent** (chương 6). Nếu consumer có side effect ra ngoài (email, thanh toán), replay sẽ lặp lại chúng: tách consumer "dựng read model" (replay thoải mái) khỏi consumer "hành động" (không replay, hoặc có flag chặn).
- Replay vào **group mới** thay vì reset group đang chạy: an toàn hơn, chạy parallel rồi chuyển.
- Retention giới hạn khả năng replay: giữ đủ dài, hoặc dùng tiered storage/archive vào object storage.
- Replay DLQ (redrive) sau khi sửa bug: đẩy về topic gốc hoặc retry topic, có rate control.
- Khi replay lượng lớn, dùng rate limit để không đè downstream DB.

## 5. Running multiple consumer versions in parallel (deploy, migration)

**Rolling deploy** cùng group: consumer cũ và mới cùng tồn tại, partition di chuyển (rebalance, chương 4). Hệ quả: một message có thể được xử lý bởi code cũ rồi code mới. Yêu cầu:
- Mọi version phải xử lý được **cả schema cũ và mới** (chương 9: tolerant reader, compatible change).
- Idempotent giữa các version (cùng dedup key của inbox).
- Dùng static membership hoặc protocol mới để giảm rebalance khi deploy.

**Breaking change** (logic mới cho kết quả khác, hoặc schema v2): chạy **group mới** (`inventory-v2`) parallel với group cũ, cùng đọc topic. Đối chiếu kết quả (shadow mode: v2 ghi vào bảng khác), khi tin tưởng thì chuyển traffic/đọc sang v2 rồi tắt v1. Với queue (RabbitMQ/SQS): tạo queue mới gắn vào cùng exchange/topic SNS rồi chuyển dần.

**Blue/green consumer** với outbox: publisher không đổi; chỉ replicate phía đọc.

**Migration broker/topic**: dual-publish (gửi cả topic cũ và mới), chuyển consumer, rồi tắt topic cũ; hoặc MirrorMaker 2 để sao chép.

## 6. Other operational practices
- Graceful shutdown: bắt SIGTERM, dừng nhận thêm, xử lý xong message đang chạy, commit rồi mới thoát; nếu không, mỗi lần deploy sinh ra duplicate và rebalance.
- Health check phân biệt "process sống" và "consumer thật sự đang tiến": nếu không commit offset trong N phút thì coi là không khỏe.
- Runbook: cách xử lý lag cao, DLQ đầy, broker mất node. Diễn tập định kỳ (chaos): kill consumer, kill broker.
- Capacity: số partition ≥ số consumer tối đa dự kiến; theo dõi dung lượng disk theo retention.
- Security: TLS, authentication (SASL), ACL theo topic, không dùng PLAINTEXT trên production (lab dùng PLAINTEXT nội bộ container chỉ vì mục đích học).

## 7. Pitfalls
- Alert theo lag tuyệt đối thay vì xu hướng/tuổi.
- Reset offset khi group còn chạy (lệnh sẽ từ chối), hoặc reset nhầm group production.
- Replay không tách consumer có side effect.
- Tăng consumer vượt số partition mong giảm lag (vô ích).
- Quên monitoring bên publisher (outbox chết thì consumer "xanh" vì không có gì đến).

## Summary
1. Lỗi async hiện ra là "chậm": theo dõi lag (xu hướng, tuổi), DLQ, outbox backlog.
2. Replay là sức mạnh của log nhưng đòi hỏi consumer idempotent và tách consumer có side effect.
3. Rolling deploy nghĩa là hai version cùng xử lý: schema compatible + idempotent.
4. Breaking change: chạy group mới parallel rồi chuyển.

## Self-check questions
1. Lag 5000 và đang giảm đều: có đáng báo động không?
2. Vì sao nên replay vào consumer group mới thay vì reset group đang chạy?
3. Metric nào cho biết publisher outbox bị chết?
4. Vì sao tăng consumer từ 8 lên 20 với topic 6 partition không giảm lag?

<details><summary>Answer</summary>

1. Không nhất thiết; xem tuổi message và SLO. Xu hướng giảm là tốt.
2. Group đang chạy phải dừng mới reset được và rủi ro tác động production; group mới chạy parallel rồi chuyển, rollback dễ.
3. Số dòng outbox chưa gửi và tuổi dòng cũ nhất tăng.
4. Trần parallelism là 6 partition; consumer thừa idle.
</details>
