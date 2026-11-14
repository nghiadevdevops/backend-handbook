# Kết quả chạy thật của lab

Chạy lại trọn vẹn ngày 08/11/2026 (lần 2), Windows + Docker Desktop, Git Bash. Kafka 4.3.1 (image `apache/kafka:latest`, KRaft một node), PostgreSQL 18 (`postgres:18-alpine`), Go `golang:latest` (go 1.27.3), `franz-go` v1.22.2, `pgx/v5` v5.12.0. Topic `orders` và `orders.dlq`, mỗi topic 3 partition.

Lần chạy này dùng `publisher.sh` và `consumer.sh` với bộ cờ CLI mới (`--reader-property`, `--command-property`, `--formatter-property`), tức là đã chạy lại sau khi đổi cờ. Compose cũng thêm cấu hình listener (advertise `bookcheck-msg-kafka:9092`) để consumer Go chạy trong cùng network kết nối được.

Kịch bản: 4 đơn (c1, c2, "flaky", c3 với tổng tiền âm) -> `place_order.sh` ghi order+outbox cùng transaction -> `publisher.sh` lần 1 giả lập crash sau khi publish (chưa đánh dấu) -> lần 2 gửi lại cả 4 event (duplicate publish) -> các consumer đọc 8 message.

## Publisher (cờ CLI mới)
```
publisher: đã publish id=1,2,3,4
publisher: GIẢ LẬP CRASH, chưa đánh dấu
(lần 2)
publisher: đã publish id=1,2,3,4
publisher: đã đánh dấu published_at
(lần 3)
publisher: không có event chưa gửi
```
End offset topic `orders` (`kafka-get-offsets.sh --time latest`): `orders:0:2`, `orders:1:2`, `orders:2:4`, tổng 8 message cho 4 event (mỗi event hai lần).

## Consumer naive (không inbox) và consumer idempotent (inbox), bằng `consumer.sh`
Ledger sau khi chạy:
```
   t   | order_id | count
-------+----------+-------
 inbox |        1 |     1
 inbox |        2 |     1
 inbox |        3 |     1
 naive |        1 |     2
 naive |        2 |     2
 naive |        3 |     2
processed_messages = 3
```
Naive ghi duplicate (mỗi đơn 2 dòng), inbox chỉ 1 dòng mỗi đơn. Log inbox:
```
[75d5cf7d-...] order=1 xử lý MỚI (lần thử 1)
[75d5cf7d-...] order=1 TRÙNG, bỏ qua (inbox đã có)
[79283ab8-...] LỖI VĨNH VIỄN (total<0) -> orders.dlq
[79283ab8-...] LỖI VĨNH VIỄN (total<0) -> orders.dlq
[5281f920-...] order=2 xử lý MỚI (lần thử 1)
[f6f9cb4e-...] lần 1: lỗi tạm thời (503), chờ 1s
[f6f9cb4e-...] lần 2: lỗi tạm thời (503), chờ 2s
[f6f9cb4e-...] order=3 xử lý MỚI (lần thử 3)
[5281f920-...] order=2 TRÙNG, bỏ qua (inbox đã có)
[f6f9cb4e-...] lần 1: lỗi tạm thời (503), chờ 1s
[f6f9cb4e-...] lần 2: lỗi tạm thời (503), chờ 2s
[f6f9cb4e-...] order=3 TRÙNG, bỏ qua (inbox đã có)
```

## Consumer idempotent bằng Go (`lab/go/main.go`, franz-go + pgx)
Trước khi chạy: `TRUNCATE ledger, processed_messages` (để so sánh với bản shell), consumer group mới `g-go-run2`, đọc từ đầu. Chạy trong container `golang:latest` thuộc network `bookcheck-msg-net`:
```
[75d5cf7d-...] order=1 xử lý MỚI (lần thử 1)
[75d5cf7d-...] order=1 TRÙNG, bỏ qua (inbox đã có)
[79283ab8-...] LỖI VĨNH VIỄN (total<0) -> orders.dlq
[79283ab8-...] LỖI VĨNH VIỄN (total<0) -> orders.dlq
[5281f920-...] order=2 xử lý MỚI (lần thử 1)
[f6f9cb4e-...] lần 1: lỗi tạm thời (503), chờ 1s
[f6f9cb4e-...] lần 2: lỗi tạm thời (503), chờ 2s
[f6f9cb4e-...] order=3 xử lý MỚI (lần thử 3)
[5281f920-...] order=2 TRÙNG, bỏ qua (inbox đã có)
[f6f9cb4e-...] lần 1: lỗi tạm thời (503), chờ 1s
[f6f9cb4e-...] lần 2: lỗi tạm thời (503), chờ 2s
[f6f9cb4e-...] order=3 TRÙNG, bỏ qua (inbox đã có)
đã đọc 8 message
```
Sau đó `ledger` có đúng 1 dòng cho mỗi order 1, 2, 3 và `processed_messages` = 3, giống bản shell. (Lần thử chạy đầu tiên trong cùng phiên đã commit offset của group `g-go`, nên lần chạy thứ hai của group đó đọc 0 message: đúng với manual commit sau khi xử lý.)

## Retry và DLQ
Đơn của khách `flaky` lỗi 2 lần đầu, retry với backoff 1s rồi 2s (không jitter, để dễ đọc), thành công lần 3. Đơn có `total_cents=-500` coi là permanent error, chuyển ngay sang `orders.dlq`:
```
4	{"reason":"negative_total","attempts":1,"original":{"payload": {"order_id": 4, "customer_id": "c3", "total_cents": -500}, "event_id": "79283ab8-...", "event_type": "OrderPlaced"}}
```
Lưu ý: vì message bị gửi duplicate, bản DLQ cũng bị duplicate (consumer DLQ cũng cần idempotent).

## TypeScript
`lab/ts/` (outbox bằng `pg`, consumer bằng `@confluentinc/kafka-javascript` 1.11.0): `npm install --ignore-scripts` rồi `tsc --noEmit` (TypeScript 5.9.3, `@types/node` 24) trong container `node:lts` chạy OK. **Chưa chạy được ở runtime**: `npm install` đầy đủ phải build librdkafka từ source (không tải được binary dựng sẵn cho image `node:lts`), mất hơn 15 phút nên đã dừng; vì vậy `consumer.ts` chỉ được kiểm tra kiểu, chưa chạy với broker.

## Lỗi gặp và cách sửa
1. Git Bash trên Windows đổi `/opt/kafka/bin/...` thành đường dẫn Windows trong `docker exec`: đặt `MSYS_NO_PATHCONV=1` (đã có trong `scripts/common.sh`).
2. `docker exec -i psql` bên trong vòng `while read` nuốt stdin của vòng lặp, làm mất message: thêm `</dev/null` cho lệnh psql dạng `-c`.
3. CLI của Kafka 4.3 báo deprecated `--property`, `--producer-property`: đã đổi sang `--formatter-property`, `--reader-property`, `--command-property`. Cảnh báo cũ in ra stdout nên consumer.sh lọc dòng bằng `grep '^[0-9]*|{'`. Lần chạy này đã xác nhận `publisher.sh` và `consumer.sh` bản cờ mới chạy đúng.
4. `apache/kafka` mặc định advertise `localhost:9092`, client trong container khác (Go, TS) nhận metadata rồi kết nối lại vào chính nó và lỗi: đặt `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://bookcheck-msg-kafka:9092` (kèm các biến listener và replication factor 1) trong `compose.yaml`.
5. Hạn chế: lab không chạy Debezium, RabbitMQ, share group.

## Outbox phía producer bằng Go (`lab/go/outbox.go`)
Chạy `go run . place c9 1234` (container `golang:latest`, network `bookcheck-msg-net`, stack dựng lại sạch):
```
order 1 và outbox đã ghi trong một transaction
 id | customer_id | total_cents | event_type  |                          payload
----+-------------+-------------+-------------+-----------------------------------------------------------
  1 | c9          |        1234 | OrderPlaced | {"order_id": 1, "customer_id": "c9", "total_cents": 1234}
```
(`outbox.ts` tương đương chỉ được kiểm tra bằng `tsc --noEmit`.)
