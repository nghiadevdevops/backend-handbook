#!/bin/sh
# Dùng: place_order.sh <customer_id> <total_cents>
# Ghi order VÀ outbox trong CÙNG một transaction.
. "$(dirname "$0")/common.sh"
psqlx shop -At <<SQL
BEGIN;
WITH o AS (INSERT INTO orders(customer_id,total_cents) VALUES ('$1',$2) RETURNING id)
INSERT INTO outbox(aggregate_id,event_type,payload)
SELECT id::text,'OrderPlaced',
       jsonb_build_object('order_id',id,'customer_id','$1','total_cents',$2) FROM o;
COMMIT;
SQL
