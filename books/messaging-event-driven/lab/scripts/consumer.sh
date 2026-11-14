#!/bin/sh
# Dùng: consumer.sh <naive|inbox> <group> <max-messages>
# Đọc topic "orders" từ đầu; ghi ledger. Có retry (backoff) và DLQ (topic orders.dlq).
. "$(dirname "$0")/common.sh"
MODE=$1; GROUP=$2; MAX=$3
TABLE=ledger; [ "$MODE" = naive ] && TABLE=ledger_naive
timeout 120 docker exec "$KAFKA" $K/kafka-console-consumer.sh --bootstrap-server $BS --topic orders \
  --group "$GROUP" --from-beginning --max-messages "$MAX" --timeout-ms 20000 \
  --formatter-property print.key=true --formatter-property key.separator='|' 2>/dev/null | grep '^[0-9]*|{' |
while IFS='|' read -r KEY JSON; do
  EID=$(echo "$JSON" | sed -n 's/.*"event_id": *"\([^"]*\)".*/\1/p')
  CUST=$(echo "$JSON" | sed -n 's/.*"customer_id": *"\([^"]*\)".*/\1/p')
  TOTAL=$(echo "$JSON" | sed -n 's/.*"total_cents": *\(-\{0,1\}[0-9]*\).*/\1/p')
  # lỗi vĩnh viễn: số tiền âm -> DLQ ngay
  if [ "$TOTAL" -lt 0 ]; then
    echo "[$EID] LỖI VĨNH VIỄN (total<0) -> orders.dlq"
    echo "$KEY|{\"reason\":\"negative_total\",\"attempts\":1,\"original\":$JSON}" | \
      timeout 60 docker exec -i "$KAFKA" $K/kafka-console-producer.sh --bootstrap-server $BS \
      --topic orders.dlq --reader-property parse.key=true --reader-property key.separator='|'
    continue
  fi
  # lỗi tạm thời: khách "flaky" lỗi 2 lần đầu, retry với backoff 1s, 2s
  ATT=0; DELAY=1
  while :; do
    ATT=$((ATT+1))
    if [ "$CUST" = flaky ] && [ "$ATT" -le 2 ]; then
      echo "[$EID] lần $ATT: lỗi tạm thời (503), chờ ${DELAY}s"; sleep $DELAY; DELAY=$((DELAY*2)); continue
    fi
    break
  done
  if [ "$MODE" = naive ]; then
    psqlx inventory -c "INSERT INTO $TABLE(order_id,reserved_cents) VALUES ($KEY,$TOTAL)" </dev/null
    echo "[$EID] order=$KEY xử lý (naive, lần thử $ATT)"
  else
    N=$(psqlx inventory -At <<SQL
BEGIN;
WITH ins AS (INSERT INTO processed_messages(message_id,consumer) VALUES ('$EID','inventory')
             ON CONFLICT DO NOTHING RETURNING 1)
INSERT INTO $TABLE(order_id,reserved_cents) SELECT $KEY,$TOTAL FROM ins RETURNING 'new';
COMMIT;
SQL
)
    if [ "$N" = new ]; then echo "[$EID] order=$KEY xử lý MỚI (lần thử $ATT)"; else echo "[$EID] order=$KEY TRÙNG, bỏ qua (inbox đã có)"; fi
  fi
done
