# Chương 10. Rate limiting và session store

## 1. Vấn đề

API đăng nhập bị dò mật khẩu: 5.000 request mỗi phút từ một IP. API công khai cần giới hạn 100 request/phút mỗi API key. Giới hạn phải **chung cho mọi server ứng dụng**, và việc "đọc counter rồi quyết định rồi ghi" phải **atomic**, nếu không hai request đồng thời cùng thấy "còn 1 lượt" và cùng được qua. Redis/Valkey phù hợp vì nhanh, có hết hạn tự động và chạy Lua/Functions atomic.

## 2. Bốn thuật toán

### Fixed window (window cố định)

```
INCR rl:fw:user7        -- nếu kết quả = 1 thì EXPIRE rl:fw:user7 60
-- kết quả > 100 thì từ chối
```

Đơn giản, rẻ. Nhược điểm: **burst ở ranh giới window**. Gửi 100 request ở giây 59 và 100 request ở giây 61 thì được 200 request trong 2 giây mà vẫn "đúng" giới hạn 100/phút. Chú ý `INCR` rồi `EXPIRE` ở hai lệnh: nếu chết giữa hai lệnh thì key không bao giờ hết hạn. Dùng Lua/Function (như bên dưới), hoặc `EXPIRE key 60 NX` (Redis 7+/Valkey) sau `INCR`.

### Sliding window log (sorted set)

Lưu mỗi request là một phần tử zset (score = thời điểm). Xóa phần tử quá cũ, đếm, so với giới hạn. Chính xác nhất, nhưng tốn bộ nhớ O(số request trong window).

### Sliding window counter

Xấp xỉ: kết hợp counter window hiện tại và trước, nhân trọng số theo phần trăm window đã trôi qua. Ít RAM, gần đúng. (Không cài trong lab, mô tả để bạn biết có lựa chọn.)

### Token bucket

Bucket chứa tối đa `capacity` token, nạp `rate` token mỗi giây. Mỗi request lấy `cost` token. Cho phép **burst** tới `capacity` rồi hạ xuống tốc độ trung bình `rate`. Lưu 2 giá trị: số token và thời điểm cập nhật cuối. Đây là thuật toán thường dùng nhất cho API.

## 3. Cài đặt bằng Function (Redis >= 7.0, Valkey)

File `lab/ratelimit/ratelimit.lua` nạp một thư viện gồm `token_bucket`, `sliding_window`, `fixed_window`:

```lua
#!lua name=ratelimit
local function token_bucket(keys, args)
  local key, capacity, rate = keys[1], tonumber(args[1]), tonumber(args[2])
  local cost = tonumber(args[3] or 1)
  local t = redis.call('TIME')
  local now = tonumber(t[1]) + tonumber(t[2]) / 1000000
  local d = redis.call('HMGET', key, 'tokens', 'ts')
  local tokens, ts = tonumber(d[1]), tonumber(d[2])
  if tokens == nil then tokens = capacity; ts = now end
  tokens = math.min(capacity, tokens + (now - ts) * rate)
  local allowed = 0
  if tokens >= cost then tokens = tokens - cost; allowed = 1 end
  redis.call('HSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
  redis.call('PEXPIRE', key, math.ceil(capacity / rate * 1000) + 1000)
  return { allowed, tostring(tokens) }
end
redis.register_function('token_bucket', token_bucket)
```

(Rút gọn; bản đầy đủ trong lab.) Nạp và gọi:

```
valkey-cli -x FUNCTION LOAD REPLACE < ratelimit.lua
valkey-cli FCALL token_bucket 1 rl:tb:user7 5 1       # capacity=5, nạp 1 token/giây
```

Vì sao dùng `TIME` của server thay vì giờ của client: nhiều máy ứng dụng có đồng hồ lệch nhau; dùng một đồng hồ duy nhất tránh sai lệch. Script chạy atomic trên server nên không có race.

Lưu ý khi dùng **Cluster**: key truyền trong `KEYS[]` để server biết slot; Function chỉ được đụng các key trong `KEYS`.

## 4. Kết quả lab

Chạy `lab/ratelimit/run.sh` trên cả Valkey 9.1.3 và Redis 8.10.3, cho **kết quả giống nhau**. `1` là cho phép, `0` là từ chối:

```
token bucket capacity=5, refill=1/s, 10 request liên tiếp:   1 1 1 1 1 0 0 0 0 0
sau 2 giây (khoảng 2 token), 4 request:                      1 1 0 0
sliding window limit=5/2000ms, 8 request liên tiếp:          1 1 1 1 1 0 0 0
đợi 2,2 giây, 3 request nữa:                                 1 1 1
fixed window limit=5/60s, 8 request:                         1 1 1 1 1 0 0 0
40 process đồng thời, token bucket capacity=10, refill~0: allowed=10 denied=30
```

Dòng cuối là kiểm tra atomicity: 40 process `valkey-cli`/`redis-cli` gọi cùng lúc, đúng 10 được qua, không race. Thư viện nạp bằng `FUNCTION LOAD` (lệnh trả `ratelimit`) và gọi bằng `FCALL`.

## 5. Session store

Lưu session trong Redis cho phép nhiều server ứng dụng chia sẻ session mà không cần sticky session.

- Mỗi session một key `sess:{id}` (string hoặc hash) với TTL bằng thời hạn session; mỗi request hợp lệ `EXPIRE` lại (sliding expiration).
- Framework web nào cũng nên dùng connection/instance riêng cho session để eviction của cache không xóa mất session (chương 7).
- **Eviction**: session không nên chung instance với cache dùng `allkeys-lru`; nếu không, đầy RAM là người dùng bị đăng xuất. Cách gọn nhất là instance (hoặc connection/database) riêng cho session với policy `noeviction` hoặc `volatile-lru` và mọi session đều có TTL.
- **Persistence**: nếu mất session là chấp nhận được (người dùng đăng nhập lại) thì không cần AOF; nếu không thì AOF `everysec` + replica.
- Concurrency: hai request song song cùng ghi session có thể đè nhau (last write wins); cần khóa theo session hoặc chỉ cập nhật từng field bằng `HSET`.

## 6. Trade-off

| | Fixed | Sliding log | Token bucket |
|---|---|---|---|
| Độ chính xác | thấp (burst ranh giới) | cao | cao theo mô hình bucket |
| RAM mỗi key | rất thấp | cao | thấp (2 field) |
| Cho phép burst | ngoài ý muốn | không | có chủ đích |
| Dùng khi | giới hạn thô, rẻ | cần chính xác, lượng nhỏ | API công khai |

## 7. Cạm bẫy

- `INCR` và `EXPIRE` ở hai lệnh rời.
- Dùng giờ client để tính window.
- Rate limit theo IP phía sau proxy mà lấy nhầm IP của proxy.
- Rate limiter **fail-open hay fail-closed** khi Redis lỗi? Quyết định trước: API công khai thường fail-open (cho qua) và alert; đăng nhập thường fail-closed với giới hạn cục bộ dự phòng.
- Session chung instance với cache bị evict.

## 8. Tóm tắt

- Rate limit chung cần phép kiểm tra-và-ghi atomic: Lua hoặc Function.
- Token bucket cho phép burst có kiểm soát; sliding window chính xác nhưng tốn RAM; fixed window rẻ nhưng burst ở ranh giới.
- Dùng `TIME` của server, key truyền qua `KEYS`.
- Session store: tách chính sách eviction và persistence khỏi cache.

## 9. Câu hỏi tự kiểm tra

1. Mô tả burst ở ranh giới window của fixed window.
2. Vì sao dùng Lua/Function thay vì `GET` rồi `SET` trong code ứng dụng?
3. Token bucket cho phép burst thế nào?
4. Vì sao dùng `TIME` của server?
5. Vì sao không để session chung instance với cache `allkeys-lru`?

<details><summary>Đáp án</summary>

1. 100 request cuối window cũ và 100 request đầu window mới liên tiếp: 200 request trong vài giây nhưng không window nào vượt 100.
2. Hai request đồng thời có thể cùng đọc "còn lượt" rồi cùng ghi; script chạy atomic nên không có race.
3. Bucket đầy `capacity` token cho phép chi ngay `capacity` request, sau đó chỉ được `rate` request mỗi giây.
4. Tránh đồng hồ giữa các máy ứng dụng bị lệch nhau.
5. Khi đầy RAM, LRU có thể xóa session và người dùng bị đăng xuất.

</details>
