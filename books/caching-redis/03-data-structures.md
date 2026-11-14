# Chapter 3. Data structures and the problems they fit

## 1. The problem

Nhiều người chỉ dùng `GET`/`SET` với chuỗi JSON. Như vậy bạn bỏ phí sức mạnh chính của Redis/Valkey: server hiểu data structure và thao tác **atomic** trên chúng. Chọn đúng data structure giúp bớt round trip, bớt race condition và bớt RAM.

Mọi lệnh dưới đây chạy được trên Valkey 9.1 và Redis 8.10 (tập lệnh lõi). Thử bằng `valkey-cli` hoặc `redis-cli`.

## 2. Quick selection table

| Data structure | Dùng cho | Lệnh tiêu biểu |
|---|---|---|
| String | Cache JSON/HTML, counter, lock, flag | `GET SET INCR SET NX PX` |
| Hash | Đối tượng có nhiều field, cập nhật từng field | `HSET HGET HGETALL HINCRBY` |
| List | Queue đơn giản, N phần tử mới nhất | `LPUSH RPOP LTRIM LRANGE` |
| Set | Tập duy nhất, tag, quan hệ | `SADD SISMEMBER SINTER` |
| Sorted set | Leaderboard, sliding window, lịch hẹn | `ZADD ZRANGE ZREMRANGEBYSCORE` |
| Stream | Event log có consumer group | `XADD XREADGROUP XACK` |
| Bitmap | Flag theo id số, DAU | `SETBIT BITCOUNT` |
| HyperLogLog | Đếm số phần tử khác nhau gần đúng | `PFADD PFCOUNT` |
| JSON, vector | Document, tìm kiếm tương tự | Module/lõi tùy sản phẩm |

## 3. Each data structure

### String

Giá trị nhị phân tối đa 512 MB (nhưng giữ nhỏ). Dùng cho cache đối tượng đã serialize.

```
SET product:42 '{"id":42,"name":"Dune","price":9.5}' EX 60
GET product:42
INCR page:views:42         # atomic, không race
SET lock:order:42 tokenA NX PX 30000   # chỉ set nếu chưa tồn tại
```

### Hash

Nhiều field nhỏ trong một key. Ưu điểm so với JSON string: đổi một field không cần đọc-sửa-ghi cả đối tượng, và hash nhỏ được mã hóa gọn.

```
HSET product:42 name Dune price 9.5 stock 100
HINCRBY product:42 stock -1
HGETALL product:42
```

Nhược điểm: TTL áp dụng cho cả key (hash field expiration có ở Redis từ 7.4 và Valkey từ 9.0, kiểm tra cú pháp trong docs của bản bạn dùng), và không lồng nhau.

### List

Danh sách có thứ tự chèn. `LPUSH` + `LTRIM` giữ N phần tử mới nhất (ví dụ 10 sản phẩm vừa xem):

```
LPUSH recent:user:7 42
LTRIM recent:user:7 0 9
LRANGE recent:user:7 0 -1
```

Làm queue việc quan trọng thì dùng Stream hoặc hệ thống queue riêng, vì List không có ack.

### Set

```
SADD tag:scifi 42 43
SISMEMBER tag:scifi 42
SINTER tag:scifi tag:classic     # sách vừa scifi vừa classic
```

Cẩn thận `SMEMBERS` trên set hàng triệu phần tử (chặn server); dùng `SSCAN`.

### Sorted set

Mỗi phần tử có `score`, luôn sắp theo score. Rất đa dụng:

```
ZADD top:sales 120 book:42 95 book:7
ZREVRANGE top:sales 0 9 WITHSCORES
```

Chương 10 dùng sorted set cho rate limiter sliding window (score là timestamp).

### Stream

Append-only log với consumer group, ack và retry.

```
XADD orders:events * order_id 1001 status paid
XGROUP CREATE orders:events workers $ MKSTREAM
XREADGROUP GROUP workers w1 COUNT 10 STREAMS orders:events >
```

Hữu ích để phát event invalidation đến nhiều node (chương 5), nhẹ hơn Kafka nhưng không thay thế được khi cần retention lớn.

### Bitmap and HyperLogLog

```
SETBIT dau:2026-11-08 1001 1        # user 1001 hoạt động hôm nay
BITCOUNT dau:2026-11-08
PFADD visitors:2026-11-08 u1 u2 u3
PFCOUNT visitors:2026-11-08         # xấp xỉ, sai số chuẩn khoảng 0.81%
```

HyperLogLog luôn dùng tối đa khoảng 12 KB mỗi key bất kể số phần tử.

### JSON and vector

- Redis 8 gồm JSON, Search/Query Engine (có vector search), Time Series và các probabilistic data structure trong bản phân phối; Vector Sets là data type mới.
- Valkey cung cấp các chức năng tương tự qua module riêng (valkey-json, valkey-search...).
- Với **cache**, bạn hiếm khi cần chúng. Dùng khi Redis/Valkey còn phục vụ vai trò tìm kiếm. Chi tiết nằm ngoài phạm vi cuốn này; hãy đọc docs của sản phẩm bạn chọn.

## 4. Key design

- Quy ước: `service:entity:id[:variant]`, ví dụ `shop:product:42:v3`.
- **Ngắn nhưng đọc được**. Key dài tốn RAM nhân với số key.
- **Có version/namespace** để invalidate hàng loạt bằng cách đổi version (chương 5).
- **Cluster hash tag**: nếu cần nhiều key cùng slot cho Lua/MULTI, bọc phần chung trong `{}`: `{user:7}:cart`, `{user:7}:profile`.

## 5. Trade-offs

- Hash tiết kiệm RAM với đối tượng nhỏ, nhưng JSON string đơn giản hơn khi luôn đọc cả đối tượng.
- Sorted set mạnh nhưng tốn RAM hơn set và list.
- Mọi data structure lớn đều có nguy cơ **big key** (chương 7).

## 6. Pitfalls

- `KEYS *` trên production (quét toàn bộ, chặn server). Dùng `SCAN`.
- Dùng `SMEMBERS`, `HGETALL`, `LRANGE 0 -1` trên data structure không giới hạn kích thước.
- Lưu một danh sách khổng lồ trong một key thay vì chia nhỏ.
- Đọc-sửa-ghi trong ứng dụng thay vì lệnh atomic (`INCR`, `HINCRBY`).

## 7. Summary

- Mỗi data structure giải một nhóm bài toán; chọn theo thao tác bạn cần.
- Lệnh atomic phía server loại bỏ nhiều race condition.
- Thiết kế key có quy ước, version và hash tag nếu dùng cluster.
- Tránh lệnh O(N) không giới hạn: `KEYS`, `SMEMBERS` trên set lớn.

## 8. Self-check questions

1. Khi nào hash tốt hơn JSON string?
2. Data structure nào hợp cho leaderboard top 10?
3. Vì sao không dùng `KEYS *` ở production?
4. HyperLogLog trả về gì và đánh đổi gì?
5. Hash tag `{}` dùng để làm gì trong cluster?

<details><summary>Answer</summary>

1. Khi cần cập nhật hoặc đọc từng field mà không phải đọc-sửa-ghi cả đối tượng.
2. Sorted set (`ZADD` + `ZREVRANGE`).
3. Nó O(N) và chặn server single-threaded xử lý lệnh; dùng `SCAN`.
4. Số phần tử khác nhau gần đúng (sai số khoảng 0.81%), đổi lại bộ nhớ cố định nhỏ.
5. Ép các key có cùng phần trong `{}` vào cùng hash slot để dùng được MULTI/Lua nhiều key.

</details>
