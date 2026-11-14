# Chapter 12. Monitoring: hit ratio, latency, SLOWLOG, LATENCY, memory

## 1. The problem

Cache "chạy tốt" cho đến khi không còn: hit ratio tụt vì ai đó đổi key, một lệnh O(N) chặn server 300 ms, bộ nhớ đầy và eviction xóa nhầm. Không đo thì chỉ biết khi người dùng phàn nàn. Chương này liệt kê các chỉ số tối thiểu và lệnh để xem. Lệnh chạy được trên cả Redis 8.10 và Valkey 9.1.

## 2. Hit ratio

```
INFO stats
  keyspace_hits:...
  keyspace_misses:...
  expired_keys:...
  evicted_keys:...
```

`hit_ratio = hits / (hits + misses)`. `keyspace_hits/misses` tính trên lệnh đọc key; số liệu cộng dồn từ lúc khởi động (hoặc `CONFIG RESETSTAT`), nên hãy lấy **delta theo thời gian** (Prometheus `rate()`).

Lưu ý: một "miss" trong ứng dụng có thể gồm cả lần đọc lock hoặc flag; hit ratio của server là trung bình mọi thứ. Đo hit ratio ở application layer (đếm theo nhóm key) nếu cần chi tiết. Trong Go hoặc Node, bọc hàm đọc cache để đếm hit/miss theo nhóm key (ví dụ counter Prometheus) rồi so với hit ratio của server.

Mục tiêu "bao nhiêu là tốt" phụ thuộc vào chi phí miss (chương 1); hit ratio 80% có thể tốt hoặc dở. Quan trọng hơn là **xu hướng** và **evicted_keys tăng**: eviction tăng cùng hit ratio giảm nghĩa là thiếu RAM.

## 3. Latency

```
valkey-cli --latency            # đo RTT liên tục (ms)
valkey-cli --latency-history
valkey-cli --intrinsic-latency 5   # latency nội tại của máy (chạy trên server, 5 giây)
```

### `LATENCY` framework

Bật ngưỡng ghi nhận sự kiện chậm:

```
CONFIG SET latency-monitor-threshold 100    # ms; 0 là tắt
LATENCY LATEST
LATENCY HISTORY command
LATENCY DOCTOR                              # gợi ý chẩn đoán dạng văn bản
LATENCY RESET
```

Các nguồn thường gặp: `fork` (persistence), `expire-cycle`, `command`, `fast-command`, AOF fsync. Một spike định kỳ mỗi N phút thường là `fork` của RDB/AOF rewrite.

### `SLOWLOG`

```
CONFIG SET slowlog-log-slower-than 10000    # micro giây; 10000 = 10 ms
CONFIG SET slowlog-max-len 256
SLOWLOG GET 10
SLOWLOG LEN
SLOWLOG RESET
```

`SLOWLOG` ghi thời gian **thực thi lệnh trong server** (không gồm mạng và queue). Mỗi mục gồm id, thời điểm, thời gian (µs), lệnh và argument, địa chỉ client. Tìm: `KEYS`, `SMEMBERS`/`HGETALL` trên big key, `SORT`, Lua nặng, `DEL` key lớn. Ghi chú: Valkey có thêm lệnh `COMMANDLOG` (đã kiểm tra `COMMAND INFO commandlog` trên Valkey 9.1.3, Redis 8.10.3 không có); chi tiết dùng xem `COMMAND DOCS commandlog`, cuốn này chưa thử.

Trong thực tế latency mà client thấy lớn hơn `SLOWLOG`: gồm mạng, queue chờ main thread (do lệnh chậm khác), serialize/deserialize ở client. Đo cả hai phía.

## 4. Memory

```
INFO memory
  used_memory_human, used_memory_rss_human, maxmemory_human
  mem_fragmentation_ratio        # rss / used_memory; >1.5 fragmentation, <1 có swap
MEMORY STATS
MEMORY USAGE <key> [SAMPLES n]
MEMORY DOCTOR
```

- So `used_memory` với `maxmemory`; theo dõi `evicted_keys`.
- `mem_fragmentation_ratio` quá cao có thể xử lý bằng `activedefrag` (kiểm tra hỗ trợ build của bạn) hoặc restart có kế hoạch.
- `--bigkeys`/`--memkeys` (chương 7) để tìm key lớn.

## 5. Metrics to put on the dashboard

| Nhóm | Chỉ số | Lấy từ |
|---|---|---|
| Hiệu quả | hit ratio, `evicted_keys/s`, `expired_keys/s` | `INFO stats` |
| Load | `instantaneous_ops_per_sec`, `connected_clients`, `blocked_clients` | `INFO stats/clients` |
| Latency | p50/p99 từ client, `LATENCY LATEST`, số mục SLOWLOG | client, `LATENCY`, `SLOWLOG LEN` |
| Memory | `used_memory`, `maxmemory`, fragmentation | `INFO memory` |
| Durability | `rdb_last_bgsave_status`, `aof_last_write_status`, `master_link_status`, `connected_slaves` | `INFO persistence/replication` |
| Network | `rejected_connections`, `total_net_input/output_bytes` | `INFO stats` |

Công cụ thu thập thường dùng: `redis_exporter` (cũng chạy được với Valkey) đẩy sang Prometheus. Alert gợi ý: `used_memory/maxmemory > 0.9`, hit ratio giảm đột ngột, `evicted_keys` > 0 kéo dài, `rdb_last_bgsave_status != ok`, `master_link_status != up`.

## 6. Investigation workflow when things are slow

1. `valkey-cli --latency` từ máy ứng dụng: mạng chậm hay server chậm?
2. `SLOWLOG GET`: lệnh nào chậm, có big key không?
3. `LATENCY LATEST`/`DOCTOR`: có spike `fork` không?
4. `INFO stats`: `instantaneous_ops_per_sec`, `evicted_keys`; `INFO clients`: `blocked_clients`.
5. `INFO memory`: gần `maxmemory`? swap (`mem_fragmentation_ratio < 1`)?
6. Hot key (LFU `--hotkeys`) hoặc dồn tải một slot (cluster)?

## 7. Pitfalls

- Đọc `keyspace_hits/misses` cộng dồn thay vì delta.
- Chạy `MONITOR` trên production (tăng tải mạnh).
- Đặt `slowlog-log-slower-than 0` (ghi mọi lệnh).
- Chỉ nhìn trung bình; phải xem p99.
- Không alert khi persistence lỗi (`bgsave` thất bại âm thầm).
- Nhầm `SLOWLOG` (thời gian thực thi) với latency end-to-end.

## 8. Summary

- Hit ratio = hits/(hits+misses), dùng delta; kết hợp `evicted_keys`.
- `SLOWLOG` cho lệnh chậm; `LATENCY` cho spike nội bộ (fork, expire, fsync).
- `INFO memory` + `maxmemory` + fragmentation; `--bigkeys` tìm key lớn.
- Có dashboard và alert trước khi incident, không sau.

## 9. Self-check questions

1. Tính hit ratio từ `INFO` thế nào, và vì sao cần delta?
2. `SLOWLOG` đo gì và không đo gì?
3. Spike latency định kỳ mỗi vài phút có thể do đâu?
4. `mem_fragmentation_ratio` nhỏ hơn 1 báo hiệu điều gì?
5. Nêu ba alert nên đặt.

<details><summary>Answer</summary>

1. `keyspace_hits / (keyspace_hits + keyspace_misses)`; counter cộng dồn nên chỉ delta mới phản ánh hiện tại.
2. Đo thời gian thực thi lệnh bên trong server; không đo mạng, queue và xử lý ở client.
3. `fork` của RDB/AOF rewrite, chu kỳ expire, hoặc fsync AOF.
4. Server đang dùng swap (RSS nhỏ hơn bộ nhớ logic), rất nguy hiểm cho latency.
5. Ví dụ: `used_memory/maxmemory > 90%`, hit ratio giảm đột ngột, `evicted_keys` tăng liên tục, `bgsave` lỗi, replica mất link.

</details>
