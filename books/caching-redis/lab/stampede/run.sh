#!/bin/sh
# Mô phỏng stampede: N client cùng đọc key vừa hết hạn. Tham số: mode = naive | lock
# Dùng: sh /lab/stampede/run.sh naive 100
. /lab/rc.sh
MODE=${1:-naive}; N=${2:-100}; KEY=product:42
psql -tAqc "TRUNCATE query_log"; rc "DEL $KEY lock:$KEY" >/dev/null

load_and_set() { v=$(dbq 42 "$MODE"); rc "SET $KEY \"$v\" EX 60" >/dev/null; }

client_naive() { [ -n "$(cget $KEY)" ] || load_and_set; }

client_lock() {
  [ -n "$(cget $KEY)" ] && return
  tok="t$$-$1"
  if [ "$(rc "SET lock:$KEY $tok NX PX 5000" | head -1)" = "+OK" ]; then
    [ -n "$(cget $KEY)" ] || load_and_set        # double-check sau khi có lock
    rc "EVAL \"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end\" 1 lock:$KEY $tok" >/dev/null
  else
    n=0; while [ $n -lt 60 ]; do sleep 0.05; [ -n "$(cget $KEY)" ] && return; n=$((n+1)); done
    echo "client $1: het thoi gian cho" >&2
  fi
}

rm -f /tmp/go; now_ms() { awk '{printf "%d", $1*1000}' /proc/uptime; }
wait_go() { while [ ! -f /tmp/go ]; do sleep 0.01; done; }
i=1
while [ $i -le $N ]; do ( wait_go; client_$MODE $i ) & i=$((i+1)); done
sleep 1; s=$(now_ms); touch /tmp/go; wait
e=$(now_ms)
echo "mode=$MODE clients=$N  truy van DB that=$(psql -tAc 'select count(*) from query_log')  thoi gian tong=$((e-s)) ms"
