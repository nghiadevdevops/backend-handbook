#!/usr/bin/env bash
# Các kịch bản lẻ (không nằm trong ma trận): ./extras.sh pg|my > out/extras.pg.txt
db=$1; dir=$(cd "$(dirname "$0")" && pwd)
if [ "$db" = pg ]; then
  list="lost_update:READ_COMMITTED lost_update_cas:READ_COMMITTED deadlock:READ_COMMITTED deadlock_ordered:READ_COMMITTED lock_timeout:READ_COMMITTED skip_locked:READ_COMMITTED nowait:READ_COMMITTED fk_lock:READ_COMMITTED fk_lock_key:READ_COMMITTED booking_exclusion:READ_COMMITTED lock_view:READ_COMMITTED mvcc_long_txn:READ_COMMITTED"
else
  list="lost_update:REPEATABLE_READ lost_update_cas:REPEATABLE_READ deadlock:REPEATABLE_READ deadlock_ordered:REPEATABLE_READ lock_timeout:REPEATABLE_READ skip_locked:REPEATABLE_READ nowait:REPEATABLE_READ gap_lock:REPEATABLE_READ gap_lock:READ_COMMITTED booking_slots:REPEATABLE_READ mvcc_long_txn:REPEATABLE_READ"
fi
for x in $list; do
  sc=${x%%:*}; lv=${x##*:}; lv=${lv//_/ }
  echo "=================== $db $sc [$lv]"
  VERBOSE=1 "$dir/run.sh" "$db" "$sc" "$lv"
done
