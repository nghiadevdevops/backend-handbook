# Chương 4. MVCC: PostgreSQL và InnoDB

## 1. Tình huống

Vì sao một báo cáo chạy 10 phút không chặn việc cập nhật đơn hàng, và ngược lại? Vì sao sau một đợt `UPDATE` toàn bảng, bảng phình gấp nhiều lần dù số dòng không đổi? Vì sao một transaction "quên commit" từ sáng khiến cả database dần chậm lại? Cả ba câu trả lời đều nằm ở **MVCC** (Multi-Version Concurrency Control, điều khiển đồng thời đa phiên bản).

Ý tưởng chung: ghi không đè lên dữ liệu cũ mà tạo **phiên bản mới**; mỗi transaction nhìn thấy phiên bản phù hợp với snapshot của nó. Nhờ đó *đọc không chặn ghi và ghi không chặn đọc*. Cái giá: phiên bản cũ phải được dọn, và nếu có người còn cần chúng thì chưa dọn được. PostgreSQL và InnoDB cùng ý tưởng nhưng đặt phiên bản cũ ở hai chỗ khác nhau.

## 2. PostgreSQL: nhiều phiên bản nằm ngay trong bảng

Mỗi dòng (**tuple**) mang các trường ẩn: `xmin` (id của transaction tạo ra tuple) và `xmax` (id của transaction xóa/lock nó, 0 nếu chưa). `UPDATE` thực chất là: đánh dấu `xmax` trên tuple cũ và **chèn một tuple mới** (có `ctid`, vị trí vật lý, mới). Tuple cũ vẫn nằm trong heap cho tới khi được dọn.

Đã chạy (`lab/scripts/mvcc_pg.sql`), bảng `mv(id, v)`:

```
trước UPDATE:  ctid=(0,1)   xmin=805  xmax=0   id=1 v=0
sau UPDATE:    ctid=(4,97)  xmin=806  xmax=0   id=1 v=1     <- tuple mới, ở chỗ khác, do transaction 806 tạo
```

Tuple cũ (`xmin=805`) bị gán `xmax=806` và trở thành "chết" khi không transaction nào còn cần thấy nó.

Một tuple hiển thị với snapshot S nếu `xmin` đã commit trước S và (`xmax` chưa có, hoặc commit sau S). Snapshot ghi lại "những transaction nào đang chạy" tại thời điểm chụp; `READ COMMITTED` chụp snapshot mới mỗi **câu lệnh**, `REPEATABLE READ` chụp một lần cho cả transaction (chương 3).

### VACUUM và bloat

Dead tuple chiếm chỗ trong bảng và index. **VACUUM** (thủ công hoặc `autovacuum` chạy nền) đánh dấu chỗ đó dùng lại được. Đã chạy: bảng 1000 dòng, tắt autovacuum, `UPDATE` toàn bảng 5 lần:

| Bước | Kích thước heap | `n_live_tup` | `n_dead_tup` |
|---|---|---|---|
| Sau INSERT 1000 dòng | 40 kB | | |
| Sau 5 lần UPDATE toàn bảng | **208 kB** | 1000 | **4870** |
| Sau `VACUUM` | 208 kB (không co lại) | 1000 | 0 |

Hai bài học: (1) **bloat** (phình bảng) là hệ quả trực tiếp của `UPDATE`; (2) `VACUUM` thường *không trả* chỗ cho hệ điều hành, chỉ cho phép tái sử dụng (chỉ cắt các empty page ở cuối bảng). `VACUUM FULL` viết lại bảng nhưng lấy lock `ACCESS EXCLUSIVE` (chương 5). Autovacuum bật mặc định; chỉ tắt trong lab để thấy hiện tượng.

### Transaction dài chặn cleanup (đã chạy)

Kịch bản `mvcc_long_txn`: A mở `REPEATABLE READ`, đọc một lần rồi giữ 8 giây. B `UPDATE` toàn bảng (1000 dòng) rồi chạy `VACUUM (VERBOSE)`:

```
B VACUUM khi A còn mở:
  tuples: 0 removed, 2000 remain, 1000 are dead but not yet removable
  removable cutoff: 828
B VACUUM sau khi A commit:
  tuples: 1000 removed, 1000 remain, 0 are dead but not yet removable
```

Ngưỡng `removable cutoff` (xmin horizon) bị giữ lại bởi transaction cũ nhất còn cần snapshot cũ. Chỉ **một** transaction dài (kể cả một `SELECT` mở trong transaction treo) là đủ để mọi bảng không cleanup được dead tuple sau mốc đó. Transaction `idle in transaction` là thủ phạm số một. Replication slot không tiêu thụ và prepared transaction bị bỏ quên cũng giữ horizon tương tự (chương 11).

## 3. InnoDB: phiên bản cũ nằm trong undo log

InnoDB **sửa dòng tại chỗ** trong clustered index (theo primary key), và ghi **undo log** chứa nội dung cũ. Mỗi record có trường ẩn `DB_TRX_ID` (transaction sửa gần nhất) và `DB_ROLL_PTR` (pointer tới undo record). Muốn thấy bản cũ, InnoDB lần theo chuỗi undo.

Mỗi transaction (ở `REPEATABLE READ`) có một **read view** lập ở lần đọc *non-locking* đầu tiên: danh sách transaction đang hoạt động. Một record thấy được nếu transaction ghi nó đã commit trước read view; nếu không, đi ngược theo undo tới phiên bản thích hợp. `READ COMMITTED` lập read view mới cho mỗi câu.

**Purge**: background thread xóa undo log mà không còn read view nào cần, và xóa vật lý các record đã đánh dấu xóa. **History list length** là số undo log đã commit nhưng chưa được purge; chỉ số này là "đồng hồ" của cleanup debt.

```sql
SELECT count FROM information_schema.INNODB_METRICS WHERE name = 'trx_rseg_history_len';
-- hoặc dòng "History list length" trong SHOW ENGINE INNODB STATUS\G
```

### Thử trên lab (kết quả chưa như kỳ vọng)

Kịch bản `lab/scenarios/my/mvcc_long_txn.sql`: A mở `REPEATABLE READ` và giữ 14 giây; B chạy 5 câu `UPDATE` toàn bảng (1000 dòng), đọc `trx_rseg_history_len` ở các thời điểm. Kết quả trên MySQL 9.7.4:

| Thời điểm | trx_rseg_history_len |
|---|---|
| Trước khi B update | 19 |
| Sau 5 UPDATE, A còn mở | 24 (tăng 5, mỗi câu `UPDATE` autocommit là một undo log) |
| 5 giây và 15 giây sau khi A commit | 25 (không giảm) |

Chỉ có phần "tăng khi có thêm undo log" được xác nhận. Tôi **chưa tái hiện được** việc con số giảm sau khi transaction dài kết thúc trong khung thời gian ngắn của lab (giá trị rất nhỏ, và con số vẫn nhích lên theo từng câu ghi); chưa xác định được nguyên nhân (nghi ngờ do cách purge xử lý lô nhỏ, hoặc cách metric này được cập nhật). Muốn thấy rõ hiệu ứng thì cần tải lớn hơn và theo dõi lâu hơn; đừng coi bảng trên là bằng chứng cho hành vi purge.

## 4. So sánh và hệ quả của transaction dài

| | PostgreSQL | InnoDB |
|---|---|---|
| Phiên bản cũ ở đâu | trong heap (cùng bảng) | trong undo log |
| `UPDATE` | tuple mới + tuple cũ giữ lại | sửa tại chỗ + undo |
| Cleanup | `VACUUM`/autovacuum | purge thread |
| Metric cleanup debt | `n_dead_tup`, tuổi xmin, kích thước bảng/index | history list length, kích thước undo tablespace |
| Hậu quả cơ bản | bloat bảng và index; scan chậm hơn | undo phình; đọc bản cũ phải đi dài theo chuỗi undo, chậm dần |
| Rollback | gần như tức thời (đánh dấu abort) | tốn thời gian tỷ lệ với lượng thay đổi |
| Đọc dữ liệu cũ | luôn đọc tuple có sẵn | tái dựng từ undo |

**Hệ quả của transaction chạy lâu**, áp dụng cho cả hai DB:

1. Giữ **snapshot cũ**: chặn cleanup (đã chạy ở PG: `1000 are dead but not yet removable`).
2. Giữ **lock**: chặn người khác và, ở PG, `ALTER TABLE` xếp hàng (chương 5).
3. Rủi ro **lost update/write skew** tăng vì khoảng thời gian đọc-đến-ghi dài.
4. Chi phí rollback lớn (InnoDB) và replication lag (transaction lớn replicate một cục).

Luật thực hành: giữ transaction ngắn, đặt `idle_in_transaction_session_timeout` (PG), monitor tuổi transaction dài nhất và history list length / `n_dead_tup`, tách job nền dài thành nhiều transaction nhỏ.

## 5. Trade-off

- MVCC đổi **không gian và công dọn dẹp** lấy **concurrency đọc/ghi**.
- Mô hình PG (tuple mới trong heap) làm `UPDATE` tốn kém khi bảng rộng và nhiều index (index phải trỏ tới tuple mới, trừ khi dùng HOT update); đổi lại rollback và đọc bản cũ rẻ.
- Mô hình InnoDB (sửa tại chỗ + undo) giữ bảng gọn hơn, nhưng đọc bản cũ và rollback có giá.

## 6. Cạm bẫy

1. Mở transaction ở đầu request rồi gọi API ngoài: giữ snapshot hàng giây.
2. Báo cáo dài trên primary trong transaction `REPEATABLE READ`: chặn cleanup của cả hệ thống.
3. Tắt autovacuum vì "tốn tài nguyên".
4. Kỳ vọng `VACUUM` thu nhỏ file bảng (cần `VACUUM FULL` hoặc công cụ viết lại, có lock).
5. Bỏ qua history list length cho tới khi đĩa đầy.

## 7. Tóm tắt

- MVCC: ghi tạo phiên bản mới, mỗi transaction thấy phiên bản theo snapshot; đọc và ghi không chặn nhau.
- PG: nhiều tuple trong heap với `xmin`/`xmax`; `UPDATE` tạo tuple mới; `VACUUM` dọn nhưng không co file. Đã chạy: 5 lần UPDATE làm bảng từ 40 kB lên 208 kB.
- InnoDB: undo log, read view, purge; chỉ số `history list length`.
- Transaction dài giữ snapshot nên chặn cleanup (PG: `dead but not yet removable`).

## 8. Tự kiểm tra

1. `xmin` và `xmax` của một tuple cho biết gì? Chuyện gì xảy ra với chúng khi `UPDATE`?
2. Vì sao `VACUUM` thường không làm file bảng nhỏ lại?
3. Vì sao một transaction mở lâu có thể làm database chậm dần dù nó không giữ lock nào?
4. History list length đo cái gì?

<details><summary>Đáp án</summary>

1. `xmin`: transaction tạo tuple; `xmax`: transaction xóa/lock nó. UPDATE gán `xmax` cho tuple cũ và tạo tuple mới với `xmin` là transaction hiện tại.
2. Nó chỉ đánh dấu chỗ trống để dùng lại; chỉ cắt empty page ở cuối bảng.
3. Snapshot cũ chặn VACUUM/purge xóa phiên bản cũ, nên bảng/undo phình dần.
4. Số undo log đã commit chưa được purge.
</details>
