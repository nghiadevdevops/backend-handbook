#!/bin/sh
# Chạy: docker cp eviction/run.sh  bookcheck-cache-valkey:/tmp/ev.sh
#       docker cp eviction/gen.awk bookcheck-cache-valkey:/tmp/gen.awk
#       docker exec bookcheck-cache-valkey sh /tmp/ev.sh valkey-cli      (Redis: container redis, redis-cli)
# Kịch bản: maxmemory 10mb, giá trị 1KB. Pha 1: nạp k:1..6000. Pha 2: nạp thêm 9000 key mới,
# xen kẽ đọc lại "key nóng" k:1..1000 (2 lần mỗi vòng). Cuối: đếm key còn sống mỗi nhóm.
# Lệnh sinh ra dạng RESP bởi gen.awk và đẩy bằng --pipe.
CLI=${1:-valkey-cli}
cnt() { $CLI EVAL "local c=0 for i=tonumber(ARGV[1]),tonumber(ARGV[2]) do c=c+redis.call('EXISTS','k:'..i) end return c" 0 "$1" "$2"; }
run() { # $1=policy $2=ex|plain $3=nhãn
  $CLI FLUSHALL >/dev/null; $CLI CONFIG SET maxmemory 10mb >/dev/null
  $CLI CONFIG SET maxmemory-policy "$1" >/dev/null; $CLI CONFIG RESETSTAT >/dev/null
  awk -v ex="$2" -f /tmp/gen.awk > /tmp/all.resp
  $CLI --pipe < /tmp/all.resp > /tmp/pipe.out 2>&1
  out=$(grep -a "errors:" /tmp/pipe.out | tail -1)
  err=$(echo "$out" | sed 's/.*errors: \([0-9]*\),.*/\1/')
  ev=$($CLI INFO stats | tr -d '\r' | awk -F: '/^evicted_keys/{print $2}')
  echo "$3 | hot=$(cnt 1 1000)/1000 cold=$(cnt 1001 6000)/5000 new=$(cnt 6001 15000)/9000 | evicted=$ev errors(OOM)=$err | dbsize=$($CLI DBSIZE)"
}
for P in noeviction allkeys-lru allkeys-lfu allkeys-random volatile-lru volatile-ttl; do run $P ex "$P"; done
run volatile-lru plain "volatile-lru (key khong co TTL)"
$CLI CONFIG SET maxmemory 0 >/dev/null; $CLI CONFIG SET maxmemory-policy noeviction >/dev/null; $CLI FLUSHALL >/dev/null
rm -f /tmp/all.resp
