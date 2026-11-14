#!/usr/bin/env bash
# Lab chinh: so sanh exact / HNSW / IVFFlat tren 50k vector 384 chieu (+ 2 demo nho).
# Chi tao container/volume/network co tien to bookcheck-ai-, khong map port.
# Moi buoc chay bang mot lenh psql rieng co timeout 600s; ket qua luu trong bang bench_res
# nen neu mot buoc bi dung thi cac buoc truoc van con. May manh hon: doi 50000 -> 100000 trong
# sql/01-data.sql va lists (50 -> 100, 224 -> 316) trong sql/03c-ivfflat.sql (build lau hon nhieu).
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash tren Windows: khong doi /tmp thanh duong dan Windows
cd "$(dirname "$0")"
IMG=pgvector/pgvector:0.8.7-pg18-trixie
C=bookcheck-ai-pg; N=bookcheck-ai-net; V=bookcheck-ai-data
cleanup() { docker rm -f $C >/dev/null 2>&1 || true; docker volume rm $V >/dev/null 2>&1 || true; docker network rm $N >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create $N >/dev/null
docker volume create $V >/dev/null
docker run -d --name $C --network $N --memory 2500m --shm-size 1g -v $V:/var/lib/postgresql \
  -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab $IMG \
  -c shared_buffers=512MB -c max_parallel_maintenance_workers=2 >/dev/null
until docker exec $C pg_isready -U postgres -d lab >/dev/null 2>&1; do sleep 1; done
sleep 4
docker cp sql $C:/tmp/sql
P="timeout 600 docker exec $C psql -U postgres -d lab -v ON_ERROR_STOP=1"
$P -f /tmp/sql/00-semantic-demo.sql | tee results-demo.txt
$P -f /tmp/sql/04-hybrid-demo.sql | tee -a results-demo.txt
$P -f /tmp/sql/01-data.sql
$P -f /tmp/sql/02-groundtruth.sql
: > results.txt
for f in 03a-exact-hnsw16 03b-hnsw32-filter 03c-ivfflat; do
  echo "=== $f ===" | tee -a results.txt
  $P -f /tmp/sql/$f.sql | tee -a results.txt || echo "(buoc $f bi dung/loi)" | tee -a results.txt
done
