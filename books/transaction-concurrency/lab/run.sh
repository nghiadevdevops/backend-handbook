#!/usr/bin/env bash
# Chạy một kịch bản hai session đồng thời.
#   ./run.sh <pg|my> <kịch-bản> ["MỨC ISOLATION"]
# Biến môi trường: VERBOSE=1 để in toàn bộ output của từng session.
# File kịch bản: scenarios/<db>/<kịch-bản>.sql, chia thành các mục:
#   -- @setup   chạy trước, một lần
#   -- @a       session A (chạy nền)
#   -- @b       session B (chạy nền, tự `sleep` trong SQL để xếp thứ tự)
#   -- @final   chạy sau khi A và B xong
# Không dùng sleep trên host: thứ tự các bước do pg_sleep()/SLEEP() trong SQL quyết định.
set -u
db=$1; sc=$2; level=${3:-}
dir=$(cd "$(dirname "$0")" && pwd)
f=$dir/scenarios/$db/$sc.sql
[ -f "$f" ] || { echo "không có $f"; exit 2; }
out=$dir/out/$db.$sc; mkdir -p "$out"

sect() { awk -v s="-- @$1" '$0==s{on=1;next} /^-- @/{on=0} on' "$f" | sed "s/__LEVEL__/$level/g"; }
if [ "$db" = pg ]; then
  cli() { docker exec -i bookcheck-txn-pg psql -U postgres -d lab -X -q -A -t -v ON_ERROR_STOP=0 2>&1; }
else
  cli() { docker exec -i -e MYSQL_PWD=lab bookcheck-txn-my mysql -uroot lab --force -N -B 2>&1; }
fi

# Đồng bộ điểm bắt đầu: độ trễ khởi động `docker exec` thất thường (có lúc vài giây), nên
# B chờ (vòng lặp bên trong SQL) cho tới khi A đã chạy câu đầu tiên. Mọi `sleep` trong
# kịch bản được tính từ thời điểm A bắt đầu. Bảng _sync do runner tạo.
if [ "$db" = pg ]; then
  pre_setup="DROP TABLE IF EXISTS _sync; CREATE TABLE _sync(x int);"
  a_prefix="INSERT INTO _sync VALUES (1);"
  b_prefix="DO \$\$ BEGIN WHILE NOT EXISTS (SELECT 1 FROM _sync) LOOP PERFORM pg_sleep(0.05); END LOOP; END \$\$;"
else
  pre_setup="DROP TABLE IF EXISTS _sync; CREATE TABLE _sync(x INT); DROP PROCEDURE IF EXISTS wait_sync;
DELIMITER //
CREATE PROCEDURE wait_sync() BEGIN WHILE (SELECT COUNT(*) FROM _sync)=0 DO DO SLEEP(0.05); END WHILE; END//
DELIMITER ;"
  a_prefix="INSERT INTO _sync VALUES (1);"
  b_prefix="CALL wait_sync();"
fi
{ echo "$pre_setup"; sect setup; } | cli > "$out/setup.txt"
{ echo "$a_prefix"; sect a; } | cli > "$out/a.txt" &
{ echo "$b_prefix"; sect b; } | cli > "$out/b.txt" &
wait
sect final | cli > "$out/final.txt"

if [ "${VERBOSE:-0}" = 1 ]; then
  for s in a b final; do echo "--- $s"; cat "$out/$s.txt"; done
fi

err=$(cat "$out/a.txt" "$out/b.txt" "$out/final.txt" | grep -E 'ERROR' | grep -v 'ANOMALY' | head -1)
if [ -n "$err" ]; then
  short=$(echo "$err" | sed -E \
    -e 's/.*could not serialize access due to concurrent update.*/40001 serialization (concurrent update)/' \
    -e 's/.*could not serialize access due to read\/write dependencies.*/40001 serialization (SSI r\/w dependencies)/' \
    -e 's/.*deadlock detected.*/40P01 deadlock/' \
    -e 's/.*canceling statement due to lock timeout.*/55P03 lock_timeout/' \
    -e 's/.*could not obtain lock on row.*/55P03 NOWAIT/' \
    -e 's/.*violates exclusion constraint.*/23P01 exclusion violation/' \
    -e 's/.*ERROR 1213 .*/1213 deadlock/' \
    -e 's/.*ERROR 1205 .*/1205 lock wait timeout/' \
    -e 's/.*ERROR 3572 .*/3572 NOWAIT/' \
    -e 's/.*ERROR 1062 .*/1062 duplicate key/' \
    | cut -c1-90)
  verdict="LỖI: $short"
elif cat "$out/a.txt" "$out/b.txt" "$out/final.txt" | grep -q 'ANOMALY:yes'; then
  verdict="CÓ"
elif cat "$out/a.txt" "$out/b.txt" "$out/final.txt" | grep -q 'ANOMALY:no'; then
  verdict="không"
else
  verdict="?"
fi
echo "$db | $sc | ${level:--} | $verdict"
