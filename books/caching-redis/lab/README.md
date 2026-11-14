# Lab: Caching với Redis/Valkey

Chạy hoàn toàn trong Docker, không map port ra host. Mọi tài nguyên có tiền tố `bookcheck-cache-`.
Image đã dùng: `valkey/valkey:9.1.3-alpine`, `redis:8.10.3-alpine`, `postgres:18-alpine`, `golang:1.27.3-alpine`, `node:26-alpine`.
Lab shell không cài thư viện nào: dùng `psql`, `valkey-cli`/`redis-cli` và `nc` (RESP inline) có sẵn trong image. Chương trình Go (`go/`) và demo TypeScript (`node/`) tải dependency bên trong container `go`/`node` (cần mạng).

> Trên Git Bash (Windows) đặt `export MSYS_NO_PATHCONV=1` trước các lệnh `docker exec ... /lab/...`.

## Khởi động (RAM tổng khoảng 600 MB)
```
cd lab
docker compose -p bookcheck-cache up -d
docker exec bookcheck-cache-client sh -c 'psql -q -f /lab/schema.sql'
```

## 1. Cache-aside với PostgreSQL
```
docker exec bookcheck-cache-client sh /lab/cacheaside/run.sh
```
Mong đợi: `hit=190 miss=10`, 10 query DB; sau update thì 11.

## 2. Stampede (thử Redis: thêm `-e CACHE_HOST=bookcheck-cache-redis` vào `docker exec`; chưa chạy thử trong lần kiểm tra)
```
docker exec bookcheck-cache-client sh /lab/stampede/run.sh naive 100
docker exec bookcheck-cache-client sh /lab/stampede/run.sh lock 100
```
Số query DB thật đọc từ bảng `query_log` của PostgreSQL. `naive` dao động (hàng chục), `lock` là 1 đến 2.

## 3. Eviction khi chạm maxmemory
```
for c in valkey:valkey-cli redis:redis-cli; do n=${c%%:*}; cli=${c##*:}
  docker cp eviction/run.sh  bookcheck-cache-$n:/tmp/ev.sh
  docker cp eviction/gen.awk bookcheck-cache-$n:/tmp/gen.awk
  docker exec bookcheck-cache-$n sh /tmp/ev.sh $cli
done
```
Mỗi policy mất khoảng 10 đến 20 giây.

## 4. Rate limiter bằng Function/Lua
```
for c in valkey:valkey-cli redis:redis-cli; do n=${c%%:*}; cli=${c##*:}
  docker cp ratelimit/ratelimit.lua bookcheck-cache-$n:/tmp/ratelimit.lua
  docker cp ratelimit/run.sh bookcheck-cache-$n:/tmp/rl.sh
  docker exec bookcheck-cache-$n sh /tmp/rl.sh $cli
done
```

## Dọn dẹp
```
docker compose -p bookcheck-cache down -v
```

## 5. Stampede bằng Go (goroutine và nhiều process)
`go/` là một module Go (`valkey-go`, `pgx/v5`, `singleflight`, `otter/v2`). Container `bookcheck-cache-go` mount `go/` tại `/app`.
```
docker exec bookcheck-cache-go sh /app/run.sh lock 5 100   # <mode> <số process> <tổng goroutine>
docker exec bookcheck-cache-go sh /app/bench.sh            # 6 cấu hình x 3 lần
docker exec bookcheck-cache-go sh /app/demo.sh             # cache-aside, L1 otter, XFetch so với TTL thường
```
Mode: `naive`, `sf` (singleflight), `lock` (`SET NX PX`), `both`. Số query DB thật đọc từ bảng `query_log`. Kết quả mẫu: chương 6 (mục 2.1) và chương 11 (mục 8).

## 6. Node.js/TypeScript
`node/` mount tại `/app` của container `bookcheck-cache-node`: `npm install`, `tsc --noEmit`, rồi chạy demo coalescing và SWR (loader giả, không phải PostgreSQL).
```
docker exec bookcheck-cache-node sh /app/run.sh
```

## Dọn dẹp Go/Node
Sau `down -v`, xóa `node/node_modules` (cache build Go nằm trong `/tmp` của container nên mất theo container). `go/go.sum` và `node/package-lock.json` giữ lại để build lặp lại được.
