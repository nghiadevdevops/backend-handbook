#!/bin/sh
# Polling publisher: outbox (published_at IS NULL) -> Kafka topic "orders" -> đánh dấu đã gửi.
# CRASH_BEFORE_MARK=1 mô phỏng crash sau khi publish nhưng trước khi đánh dấu (=> gửi trùng).
# Lab dùng 1 publisher nên không cần FOR UPDATE SKIP LOCKED (xem chương 7).
. "$(dirname "$0")/common.sh"
ROWS=$(psqlx shop -At -F '|' -c "SELECT id, aggregate_id, jsonb_build_object('event_id',event_id,'event_type',event_type,'payload',payload)::text FROM outbox WHERE published_at IS NULL ORDER BY id")
[ -z "$ROWS" ] && { echo "publisher: không có event chưa gửi"; exit 0; }
IDS=$(echo "$ROWS" | cut -d'|' -f1 | paste -sd, -)
# key|value  (key = aggregate_id, giữ thứ tự theo đơn)
echo "$ROWS" | cut -d'|' -f2- | timeout 60 docker exec -i "$KAFKA" $K/kafka-console-producer.sh \
  --bootstrap-server $BS --topic orders --reader-property parse.key=true --reader-property key.separator='|' \
  --command-property acks=all --command-property enable.idempotence=true
echo "publisher: đã publish id=$IDS"
if [ "$CRASH_BEFORE_MARK" = 1 ]; then echo "publisher: GIẢ LẬP CRASH, chưa đánh dấu"; exit 1; fi
psqlx shop -c "UPDATE outbox SET published_at=now() WHERE id IN ($IDS)"
echo "publisher: đã đánh dấu published_at"
