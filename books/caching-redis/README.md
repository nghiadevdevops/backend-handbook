# Caching chuyên sâu với Redis/Valkey

Bản học tiếng Việt cho developer backend (Go hoặc TypeScript/Node.js, SQL) đã biết system design cơ bản. Kiến thức kiểm tra tháng 11/2026.

## Ai nên đọc, cần biết gì
- Đã viết ứng dụng web có database (PostgreSQL/MySQL), biết HTTP và khái niệm cache ở mức cơ bản.
- Biết đọc Go hoặc TypeScript; các lab dùng shell (`psql`, `valkey-cli`/`redis-cli`), một chương trình Go và một demo TypeScript.
- Có Docker. Không cần cài gì khác trên máy.

## Mục lục
1. [Khi nào nên cache, khi nào KHÔNG, và các cache layer](01-when-to-cache-and-cache-layers.md)
2. [Redis và Valkey: bối cảnh năm 2026](02-redis-and-valkey-landscape.md)
3. [Data structure và bài toán tương ứng](03-data-structures.md)
4. [Các pattern cache](04-caching-patterns.md)
5. [Invalidation và consistency](05-invalidation-and-consistency.md)
6. [Cache stampede (lab: đo số query DB)](06-cache-stampede.md)
7. [Hot key, big key, eviction và maxmemory (lab: so sánh policy)](07-hot-key-big-key-eviction.md)
8. [Persistence, replication, Sentinel và Cluster](08-persistence-replication-cluster.md)
9. [Distributed lock và tranh luận Redlock](09-distributed-lock.md)
10. [Rate limiting và session store (lab: Function/Lua)](10-rate-limiting-and-sessions.md)
11. [Caching trong ứng dụng Go và Node.js](11-caching-in-go-and-nodejs.md)
12. [Monitoring](12-monitoring.md)

Ví dụ xuyên suốt: bảng `products`, key `product:{id}`, hàm `getProduct`/`updateProduct`.

## Phiên bản đã dùng hoặc kiểm tra (07-08/11/2026)
| Thành phần | Phiên bản | Cách kiểm tra |
|---|---|---|
| Valkey | 9.1.3 (stable mới nhất, 26/10/2026; 9.2.0-rc2 là pre-release) | GitHub releases; chạy lab bằng `valkey/valkey:9.1.3-alpine` |
| Redis | 8.10.3 (stable mới nhất, 26/10/2026; 8.12 RC2 là pre-release) | GitHub releases; chạy lab bằng `redis:8.10.3-alpine` |
| PostgreSQL | 18 (`postgres:18-alpine`) | chạy lab |
| Go | 1.27.3 (`golang:1.27.3-alpine`) | go.dev/dl |
| `valkey-go` | v1.0.79 (15/10/2026) | GitHub releases, `go mod tidy` |
| `go-redis` | v9.23.0 (05/10/2026), chỉ tra, chưa chạy | GitHub releases |
| `pgx/v5`, `x/sync`, `otter/v2` | v5.12.0, v0.24.0, v2.4.0 | `go mod tidy` trong lab |
| Node.js | 26 LTS "Lithium" (26.13.0, `node:26-alpine`) | nodejs.org/dist |
| TypeScript, `ioredis`, `@types/node` | 7.0.2, 6.0.0, 26.6.6 | npm registry, `npm ls` trong lab |

## Cách chạy lab
Xem [lab/README.md](lab/README.md). Tóm tắt: `cd lab && docker compose -p bookcheck-cache up -d`, nạp `schema.sql`, chạy các lab shell (cache-aside, stampede, eviction, rate limiter), chương trình Go (`docker exec bookcheck-cache-go sh /app/bench.sh`), demo Node (`docker exec bookcheck-cache-node sh /app/run.sh`), cuối cùng `docker compose -p bookcheck-cache down -v`. Không map port; mọi thứ có tiền tố `bookcheck-cache-`.

## Những điều chưa kiểm chứng (đọc trước khi tin)
- Code Go (`lab/go`) và TypeScript (`lab/node`) trong sách đã chạy thật trên Valkey 9.1.3, chưa chạy trên Redis; demo Node dùng loader giả (bộ đếm), không phải PostgreSQL. Lab stampede shell chỉ chạy trên Valkey.
- Số liệu lab là một vài lần chạy trên máy đang chia sẻ với nhiều container khác; dùng để so sánh hành vi, không phải benchmark.
- `COMMANDLOG` của Valkey và API loader tự gộp của otter: ghi "chưa xác minh" trong chương.

## Đọc thêm
- Tài liệu Redis: https://redis.io/docs/ (và trang license: https://redis.io/legal/licenses/)
- Tài liệu Valkey: https://valkey.io/ (docs và blog phát hành)
- Martin Kleppmann, "How to do distributed locking" (08/02/2016): https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html và phản hồi của antirez "Is Redlock safe?": http://antirez.com/news/101
- A. Vattani, F. Chierichetti, K. Lowenstein, "Optimal Probabilistic Cache Stampede Prevention", PVLDB 8(8), 2015.
- Tài liệu `valkey-go`: https://github.com/valkey-io/valkey-go; `go-redis`: https://github.com/redis/go-redis; `singleflight`: https://pkg.go.dev/golang.org/x/sync/singleflight
- Sách: Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly), phần về replication, partitioning và consistency.

(Các URL của Kleppmann/antirez và paper Vattani được ghi theo trí nhớ về địa chỉ chuẩn, chưa mở lại trong lần kiểm tra này.)
