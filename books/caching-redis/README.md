# Caching with Redis & Valkey

A Vietnamese study edition for backend developers (Go or TypeScript/Node.js, SQL) who already know basic system design. Knowledge checked in November 2026.

## Who this book is for and prerequisites
- You have written web applications backed by a database (PostgreSQL/MySQL) and know HTTP and the concept of a cache at a basic level.
- You can read Go or TypeScript; the labs use the shell (`psql`, `valkey-cli`/`redis-cli`), a Go program, and a TypeScript demo.
- You have Docker. Nothing else needs to be installed on your machine.

## Contents
1. [Chapter 1. When to cache, when NOT to, and the cache layers](01-when-to-cache-and-cache-layers.md)
2. [Chapter 2. Redis and Valkey: the 2026 landscape](02-redis-and-valkey-landscape.md)
3. [Chapter 3. Data structures and the problems they fit](03-data-structures.md)
4. [Chapter 4. Cache patterns](04-caching-patterns.md)
5. [Chapter 5. Invalidation and consistency](05-invalidation-and-consistency.md)
6. [Chapter 6. Cache stampede (dogpile)](06-cache-stampede.md) (lab: measuring DB query counts)
7. [Chapter 7. Hot key, big key, eviction, and `maxmemory`](07-hot-key-big-key-eviction.md) (lab: comparing policies)
8. [Chapter 8. Persistence, replication, Sentinel, and Cluster](08-persistence-replication-cluster.md)
9. [Chapter 9. Distributed lock](09-distributed-lock.md) (including the Redlock debate)
10. [Chapter 10. Rate limiting and session store](10-rate-limiting-and-sessions.md) (lab: Function/Lua)
11. [Chapter 11. Caching in Go and Node.js applications](11-caching-in-go-and-nodejs.md)
12. [Chapter 12. Monitoring: hit ratio, latency, SLOWLOG, LATENCY, memory](12-monitoring.md)

Running example: the `products` table, the key `product:{id}`, and the functions `getProduct`/`updateProduct`.

## Versions used or checked (07-08/11/2026)
| Component | Version | How it was checked |
|---|---|---|
| Valkey | 9.1.3 (latest stable, 26/10/2026; 9.2.0-rc2 is a pre-release) | GitHub releases; lab runs on `valkey/valkey:9.1.3-alpine` |
| Redis | 8.10.3 (latest stable, 26/10/2026; 8.12 RC2 is a pre-release) | GitHub releases; lab runs on `redis:8.10.3-alpine` |
| PostgreSQL | 18 (`postgres:18-alpine`) | ran the lab |
| Go | 1.27.3 (`golang:1.27.3-alpine`) | go.dev/dl |
| `valkey-go` | v1.0.79 (15/10/2026) | GitHub releases, `go mod tidy` |
| `go-redis` | v9.23.0 (05/10/2026), looked up only, not run | GitHub releases |
| `pgx/v5`, `x/sync`, `otter/v2` | v5.12.0, v0.24.0, v2.4.0 | `go mod tidy` in the lab |
| Node.js | 26 LTS "Lithium" (26.13.0, `node:26-alpine`) | nodejs.org/dist |
| TypeScript, `ioredis`, `@types/node` | 7.0.2, 6.0.0, 26.6.6 | npm registry, `npm ls` in the lab |

## Running the labs
See [lab/README.md](lab/README.md). In short: `cd lab && docker compose -p bookcheck-cache up -d`, load `schema.sql`, run the shell labs (cache-aside, stampede, eviction, rate limiter), the Go program (`docker exec bookcheck-cache-go sh /app/bench.sh`), the Node demo (`docker exec bookcheck-cache-node sh /app/run.sh`), and finally `docker compose -p bookcheck-cache down -v`. No ports are mapped; everything is prefixed `bookcheck-cache-`.

## What has not been verified (read before trusting)
- The Go (`lab/go`) and TypeScript (`lab/node`) code in the book has actually run on Valkey 9.1.3, not on Redis; the Node demo uses a fake loader (a counter), not PostgreSQL. The shell stampede lab ran only on Valkey.
- The lab numbers come from a few runs on a machine shared with many other containers; use them to compare behavior, not as benchmarks.
- Valkey's `COMMANDLOG` and otter's built-in coalescing loader API are marked "not verified" in the chapters.

## Further reading
- Redis documentation: https://redis.io/docs/ (and the license page: https://redis.io/legal/licenses/)
- Valkey documentation: https://valkey.io/ (docs and release blog)
- Martin Kleppmann, "How to do distributed locking" (08/02/2016): https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html and antirez's reply "Is Redlock safe?": http://antirez.com/news/101
- A. Vattani, F. Chierichetti, K. Lowenstein, "Optimal Probabilistic Cache Stampede Prevention", PVLDB 8(8), 2015.
- `valkey-go` documentation: https://github.com/valkey-io/valkey-go; `go-redis`: https://github.com/redis/go-redis; `singleflight`: https://pkg.go.dev/golang.org/x/sync/singleflight
- Book: Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly), the parts on replication, partitioning, and consistency.

(The Kleppmann/antirez URLs and the Vattani paper are given from memory of the canonical addresses and were not reopened in this check.)
