#!/bin/sh
# Chạy BÊN TRONG container server:  sh /tmp/rl.sh valkey-cli    (cần /tmp/ratelimit.lua)
CLI=${1:-valkey-cli}
$CLI FLUSHALL >/dev/null
$CLI -x FUNCTION LOAD REPLACE < /tmp/ratelimit.lua
echo "--- token bucket: capacity=5, refill=1/s. 10 yeu cau lien tiep:"
i=1; while [ $i -le 10 ]; do printf "%s " "$($CLI FCALL token_bucket 1 rl:tb:u7 5 1 | head -1)"; i=$((i+1)); done; echo
sleep 2
echo "--- sau 2 giay (hoi ~2 token), 4 yeu cau:"
i=1; while [ $i -le 4 ]; do printf "%s " "$($CLI FCALL token_bucket 1 rl:tb:u7 5 1 | head -1)"; i=$((i+1)); done; echo
echo "--- sliding window: limit=5 / 2000ms. 8 yeu cau lien tiep, doi 2.2s, 3 yeu cau nua:"
i=1; while [ $i -le 8 ]; do printf "%s " "$($CLI FCALL sliding_window 1 rl:sw:u7 5 2000 req$i)"; i=$((i+1)); done; echo
sleep 2.2
i=11; while [ $i -le 13 ]; do printf "%s " "$($CLI FCALL sliding_window 1 rl:sw:u7 5 2000 req$i)"; i=$((i+1)); done; echo
echo "--- fixed window: limit=5 / 60s. 8 yeu cau:"
i=1; while [ $i -le 8 ]; do printf "%s " "$($CLI FCALL fixed_window 1 rl:fw:u7 5 60)"; i=$((i+1)); done; echo
echo "--- dong thoi: 40 tien trinh cung goi token_bucket (capacity=10, refill ~0) -> so duoc phep:"
$CLI DEL rl:tb:race >/dev/null
rm -f /tmp/race.out; i=1
while [ $i -le 40 ]; do ( $CLI FCALL token_bucket 1 rl:tb:race 10 0.0001 | head -1 >> /tmp/race.out ) & i=$((i+1)); done; wait
echo "allowed=$(grep -c '^1' /tmp/race.out) denied=$(grep -c '^0' /tmp/race.out)"
$CLI FLUSHALL >/dev/null; rm -f /tmp/race.out
