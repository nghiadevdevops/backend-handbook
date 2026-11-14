#!/usr/bin/env bash
# Kiểm tra mã TypeScript của sách: tsc --noEmit + các demo không cần API key.
# Chỉ tạo container/network có tiền tố bookcheck-aits-, không map port; tự dọn khi kết thúc.
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/ts"
N=bookcheck-aits-net; PG=bookcheck-aits-pg
cleanup() { docker rm -f $PG >/dev/null 2>&1 || true; docker network rm $N >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker network create $N >/dev/null
docker run -d --name $PG --network $N --memory 512m -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab \
  pgvector/pgvector:0.8.7-pg18-trixie >/dev/null
until docker exec $PG pg_isready -U postgres -d lab >/dev/null 2>&1; do sleep 1; done
sleep 3
docker cp sql/schema.sql $PG:/tmp/schema.sql
timeout 300 docker exec $PG psql -U postgres -d lab -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql
timeout 600 docker run --rm --name bookcheck-aits-node --network $N --memory 768m \
  -e DATABASE_URL=postgres://postgres:lab@$PG:5432/lab \
  -v "$PWD:/app:ro" node:lts-alpine sh /app/ts-checks.sh
