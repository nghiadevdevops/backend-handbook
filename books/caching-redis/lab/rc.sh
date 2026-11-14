# Thư viện nhỏ chạy trong container client (busybox sh). Nói RESP "inline" qua nc,
# nên không cần cài client nào. CACHE_HOST: bookcheck-cache-valkey hoặc bookcheck-cache-redis.
CACHE_HOST=${CACHE_HOST:-bookcheck-cache-valkey}   # hoặc bookcheck-cache-redis
rc() { printf '%s\r\n' "$*" | nc -w2 "$CACHE_HOST" 6379 | tr -d '\r'; }
# GET trả về giá trị (rỗng nếu miss): dòng 1 là "$len" hoặc "$-1"
cget() { rc "GET $1" | sed -n '2p'; }
# Truy vấn "nặng": ghi một dòng vào query_log để đếm truy vấn thật, ngủ $DB_SLEEP giây
dbq() {
  psql -tAq -c "WITH i AS (INSERT INTO query_log(tag) VALUES ('$2') RETURNING 1)
    SELECT p.name||'|'||p.price FROM products p, pg_sleep(${DB_SLEEP:-0.2}) WHERE p.id=$1"
}
