# Chương 7. Hot key, big key, eviction và `maxmemory`

## 1. Vấn đề

Redis/Valkey lưu mọi thứ trong RAM, và xử lý lệnh chủ yếu trên **một thread**. Hai kiểu failure thường gặp:

- Một key chiếm cả triệu phần tử hoặc vài chục MB (**big key**). Một lệnh `DEL`/`HGETALL` trên nó chặn mọi client khác.
- Một key nhận phần lớn traffic (**hot key**), dồn tải lên một node (nhất là trong cluster, nơi key thuộc đúng một slot).
- RAM đầy: nếu không cấu hình giới hạn, hệ điều hành giết process (OOM killer); nếu có giới hạn nhưng chọn sai policy, ghi bị từ chối hoặc xóa nhầm dữ liệu quan trọng.

## 2. `maxmemory` và eviction policy

```
CONFIG SET maxmemory 2gb
CONFIG SET maxmemory-policy allkeys-lru
```

Khi bộ nhớ dùng vượt `maxmemory`, server áp dụng `maxmemory-policy`:

| Policy | Hành vi |
|---|---|
| `noeviction` (mặc định) | Không xóa gì; lệnh ghi bị từ chối với lỗi OOM, lệnh đọc vẫn chạy |
| `allkeys-lru` | Xóa key ít dùng gần đây nhất (xấp xỉ) trong **mọi** key |
| `allkeys-lfu` | Xóa key ít được dùng nhất theo tần suất (xấp xỉ) |
| `allkeys-random` | Xóa ngẫu nhiên |
| `volatile-lru` / `volatile-lfu` / `volatile-random` | Như trên nhưng chỉ xét key **có TTL** |
| `volatile-ttl` | Xóa key có TTL còn ít nhất |

Điểm quan trọng:
- LRU/LFU của Redis/Valkey là **xấp xỉ**: sampling một số key (`maxmemory-samples`, mặc định 5) rồi xóa key tệ nhất trong mẫu. Tăng số mẫu thì chính xác hơn nhưng tốn CPU hơn.
- Policy `volatile-*` mà không có key nào có TTL thì hành xử như `noeviction`: ghi bị lỗi OOM. Đây là cạm bẫy phổ biến.
- LFU dùng counter logarit có suy giảm theo thời gian (`lfu-log-factor`, `lfu-decay-time`).
- Với cache thuần túy, thường chọn `allkeys-lru` hoặc `allkeys-lfu`. Nếu cùng instance còn chứa dữ liệu không được mất (queue, lock, session), tách instance, hoặc dùng `volatile-*` và chỉ đặt TTL cho dữ liệu cache.
- Chừa chỗ cho overhead: replication buffer, client output buffer, fragmentation. Đặt `maxmemory` khoảng 60 đến 75% RAM máy/container khi có fork (RDB/AOF rewrite dùng copy-on-write).

### Kết quả lab

Kịch bản (`lab/eviction/run.sh`): `maxmemory 10mb`, giá trị 1 KB, nạp 15.000 key (nhiều hơn sức chứa) và đọc lại một tập "key nóng" xen kẽ; sau đó đếm key còn sống theo nhóm. Chi tiết và bảng số liệu ngay dưới.

Môi trường: Valkey 9.1.3 và Redis 8.10.3 (mỗi cái một container `--memory 128m`), `maxmemory 10mb`, giá trị 1 KB. Pha 1 nạp `k:1..6000`; pha 2 nạp thêm 9.000 key mới (`k:6001..15000`) xen kẽ đọc lại 1.000 "key nóng" `k:1..1000` (2 lần mỗi vòng, 9 vòng). Mọi key có `EX 3600`, trừ dòng cuối. Mỗi ô là số key **còn sống** cuối kịch bản. Đây là **một lần chạy** mỗi policy, thuật toán dùng sampling ngẫu nhiên nên con số thay đổi giữa các lần.

Valkey 9.1.3:

| Policy | hot (/1000) | cold (/5000) | new (/9000) | evicted | lỗi OOM | dbsize |
|---|---|---|---|---|---|---|
| noeviction | 1000 | 5000 | 2623 | 0 | 6377 | 8623 |
| allkeys-lru | 445 | 1402 | 6012 | 7141 | 0 | 7859 |
| allkeys-lfu | 1000 | 130 | 1233 | 12637 | 0 | 2379 |
| allkeys-random | 416 | 2044 | 5443 | 7097 | 0 | 7903 |
| volatile-lru | 580 | 1410 | 5697 | 7313 | 0 | 7687 |
| volatile-ttl | 39 | 580 | 7890 | 6491 | 0 | 8509 |
| volatile-lru, key không TTL | 1000 | 5000 | 2824 | 0 | 6176 | 8824 |

Redis 8.10.3:

| Policy | hot (/1000) | cold (/5000) | new (/9000) | evicted | lỗi OOM | dbsize |
|---|---|---|---|---|---|---|
| noeviction | 1000 | 5000 | 2283 | 0 | 6717 | 8283 |
| allkeys-lru | 549 | 1519 | 5265 | 7667 | 0 | 7333 |
| allkeys-lfu | 1000 | 1573 | 3908 | 8519 | 0 | 6481 |
| allkeys-random | 391 | 1947 | 5204 | 7458 | 0 | 7542 |
| volatile-lru | 605 | 1523 | 5134 | 7738 | 0 | 7262 |
| volatile-ttl | 31 | 447 | 7584 | 6864 | 0 | 8060 |
| volatile-lru, key không TTL | 1000 | 5000 | 2367 | 0 | 6633 | 8367 |

Nhận xét:
- `noeviction`: dữ liệu cũ giữ nguyên, mọi ghi sau khi đầy bị từ chối (6377 lỗi OOM ở Valkey). Chính xác với mô tả ở mục 2.
- `volatile-lru` với key không có TTL cho kết quả **giống hệt `noeviction`** (`evicted=0`, hàng nghìn lỗi OOM): đây là cạm bẫy đã nêu.
- `allkeys-lfu` giữ lại **cả 1.000 key nóng** ở cả hai sản phẩm, vì chúng được đọc nhiều lần nên counter tần suất cao; key lạnh và key mới (chỉ ghi một lần) bị xóa trước.
- `allkeys-lru` chỉ giữ khoảng một nửa key nóng (445 và 549 trên 1000). Lý do hợp lý: LRU xấp xỉ sampling 5 key, và 9.000 key mới ghi gần đây luôn "mới hơn" key nóng đọc ở vòng trước. Kịch bản ghi nhiều đẩy LRU vào thế bất lợi; LFU hợp hơn khi có tập nóng ổn định.
- `allkeys-random` mất key nóng ngang key lạnh, đúng như kỳ vọng.
- `volatile-ttl`: vì mọi key cùng `EX 3600`, key còn ít TTL nhất là key **ghi sớm nhất**, nên policy này thành "xóa key cũ nhất" và gần như xóa sạch key nóng (39 và 31 trên 1000) dù chúng được đọc liên tục. Chỉ dùng `volatile-ttl` khi TTL thật sự phản ánh giá trị của key.
- Bất thường chưa giải thích: với `allkeys-lfu` Valkey xóa nhiều hơn hẳn (12.637 key, `dbsize` 2.379) so với Redis (8.519 key, `dbsize` 6.481). Mình chỉ ghi nhận hiện tượng từ một lần chạy; chưa tìm nguyên nhân và không kết luận rằng một bên "tốt hơn".

Chạy lại: xem `lab/README.md`, mục eviction.

## 3. Big key

Phát hiện:

```
valkey-cli --bigkeys              # quét bằng SCAN, theo từng kiểu
valkey-cli --memkeys              # theo bộ nhớ
MEMORY USAGE product:list:all     # byte của một key
```

(Redis: `redis-cli --bigkeys`, `--memkeys`; cùng cú pháp.) Chạy trên replica hoặc giờ thấp điểm.

Xử lý:
- **Chia nhỏ** (sharding ở application layer): `cart:{user}:{bucket}` thay vì một hash khổng lồ.
- Xóa bằng `UNLINK` (giải phóng bộ nhớ ở background thread) thay vì `DEL`; duyệt bằng `SSCAN`/`HSCAN`/`ZSCAN`.
- Lazy free: `lazyfree-lazy-eviction`, `lazyfree-lazy-expire`, `lazyfree-lazy-server-del`, `lazyfree-lazy-user-del`. Đã kiểm tra trong lab: image Valkey 9.1.3 để mặc định `yes` cả bốn, còn Redis 8.10.3 để mặc định `no`. Đây là khác biệt thật giữa hai sản phẩm, hãy tự đặt giá trị bạn muốn.
- Nén giá trị JSON lớn (gzip/zstd) nếu CPU rẻ hơn RAM/mạng.

## 4. Hot key

Phát hiện: `valkey-cli --hotkeys` chỉ hoạt động khi policy là LFU (nó đọc counter LFU); hoặc `MONITOR` trong thời gian ngắn (rất nặng, cẩn thận), hoặc đo ở client/proxy layer.

Giảm tải:
- **L1 in-process** với TTL vài giây (APCu, memo) cho key cực nóng.
- **Sao chép key** (`product:42#0..#N`), mỗi request chọn ngẫu nhiên một bản; ghi/xóa phải xử lý tất cả bản.
- Đọc từ replica (chấp nhận độ cũ nhỏ).
- Phục vụ qua CDN/reverse proxy nếu là nội dung công khai.

## 5. Cạm bẫy

- Để mặc định `noeviction` rồi dùng như cache: đầy RAM thì mọi lệnh ghi lỗi.
- `volatile-lru` nhưng quên đặt TTL.
- `KEYS`, `SMEMBERS`, `HGETALL`, `DEL` trên big key trong giờ cao điểm.
- `maxmemory` bằng đúng RAM container: lúc fork hoặc client buffer lớn sẽ bị OOM-kill.
- Dùng `FLUSHALL` để "dọn cache" trên instance dùng chung.

## 6. Tóm tắt

- Luôn đặt `maxmemory` và policy phù hợp: cache thuần dùng `allkeys-lru/lfu`.
- LRU/LFU là xấp xỉ qua sampling; `volatile-*` cần key có TTL.
- Big key chặn server; hot key dồn tải một node. Phát hiện bằng `--bigkeys`, `MEMORY USAGE`, LFU `--hotkeys`.
- Xử lý bằng chia nhỏ, `UNLINK`, L1 cache, sao chép key.

## 7. Câu hỏi tự kiểm tra

1. Policy mặc định là gì và hệ quả khi RAM đầy?
2. Vì sao `volatile-lru` có thể khiến lệnh ghi lỗi?
3. LRU của Redis/Valkey chính xác tuyệt đối không?
4. Vì sao dùng `UNLINK` thay `DEL` cho key lớn?
5. Nêu hai cách giảm tải hot key.

<details><summary>Đáp án</summary>

1. `noeviction`; lệnh ghi bị từ chối với lỗi OOM, đọc vẫn chạy.
2. Nếu không còn key nào có TTL thì không có gì để xóa, nên hành xử như `noeviction`.
3. Không, nó sampling (`maxmemory-samples`) và xóa key tệ nhất trong mẫu.
4. `UNLINK` gỡ key khỏi keyspace ngay rồi giải phóng bộ nhớ ở background thread, không chặn main thread.
5. L1 cache in-process TTL ngắn; sao chép key thành nhiều bản; đọc từ replica; đẩy ra CDN.

</details>
