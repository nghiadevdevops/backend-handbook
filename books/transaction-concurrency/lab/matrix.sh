#!/usr/bin/env bash
# Chạy bảng anomaly x isolation level cho một DB: ./matrix.sh pg|my > out/matrix.pg.txt
db=$1
dir=$(cd "$(dirname "$0")" && pwd)
if [ "$db" = pg ]; then LV=("READ COMMITTED" "REPEATABLE READ" "SERIALIZABLE"); else LV=("READ UNCOMMITTED" "READ COMMITTED" "REPEATABLE READ" "SERIALIZABLE"); fi
for sc in dirty_write dirty_read non_repeatable phantom phantom_update read_skew lost_update write_skew booking; do
  for l in "${LV[@]}"; do "$dir/run.sh" "$db" "$sc" "$l"; done
done
for sc in lost_update_atomic lost_update_forupdate lost_update_cas ws_forupdate ws_materialize; do
  for l in "READ COMMITTED" "REPEATABLE READ" "SERIALIZABLE"; do "$dir/run.sh" "$db" "$sc" "$l"; done
done
