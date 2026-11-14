# Chương 5. Lock: PostgreSQL và InnoDB

## 1. Tình huống

Hai request cập nhật cùng một đơn hàng; một cái "đứng" hai mươi giây mà không báo lỗi. Hoặc bạn thêm foreign key và đột nhiên `UPDATE` parent table chặn `INSERT` child table. Hoặc `ALTER TABLE` nhanh gọn trên staging nhưng làm cả site đứng hình trên production. Tất cả là chuyện lock. Chương này liệt kê các loại lock của PostgreSQL và InnoDB, cách xem chúng, và những chỗ hay gây bất ngờ.

## 2. PostgreSQL

### Row lock: bốn mode

Row lock không nằm trong bảng `pg_locks` theo từng dòng; nó được ghi vào chính tuple (xmax, chương 4). Bốn mode, từ mạnh đến yếu:

| Mode | Lấy khi |
|---|---|
| `FOR UPDATE` | `SELECT ... FOR UPDATE`; `DELETE`; `UPDATE` đụng cột thuộc unique index (key) |
| `FOR NO KEY UPDATE` | `UPDATE` không đụng cột key; `SELECT ... FOR NO KEY UPDATE` |
| `FOR SHARE` | `SELECT ... FOR SHARE` |
| `FOR KEY SHARE` | Kiểm tra foreign key khi insert/update child table |

Xung đột (đánh dấu X = xung đột, theo tài liệu PostgreSQL "Explicit Locking"):

| Đang giữ \ Xin | KEY SHARE | SHARE | NO KEY UPDATE | UPDATE |
|---|---|---|---|---|
| KEY SHARE | | | | X |
| SHARE | | | X | X |
| NO KEY UPDATE | | X | X | X |
| UPDATE | X | X | X | X |

Ý nghĩa thực tế: `FOR KEY SHARE` (do foreign key) chỉ xung đột với `FOR UPDATE`. Nhờ đó cập nhật cột thường của parent table không chặn insert child table.

### Lock do foreign key gây ra (đã chạy)

Bảng `parent(id, name)` và `child(id, parent_id REFERENCES parent)`. A giữ transaction mở 4 giây; B `INSERT INTO child(parent_id) VALUES (1)` với `lock_timeout = 1s`.

- A: `UPDATE parent SET name='...' WHERE id=1` (lấy `FOR NO KEY UPDATE`): B **không chờ**, insert xong ngay (`fk_lock`).
- A: `SELECT ... FROM parent WHERE id=1 FOR UPDATE`: B bị chặn và hết `lock_timeout`; log của câu lỗi cho thấy chính câu kiểm tra foreign key: `SELECT 1 FROM ONLY "public"."parent" x WHERE "id" OPERATOR(pg_catalog.=) $1 FOR KEY SHARE OF x` (`fk_lock_key`). Lỗi: `canceling statement due to lock timeout`.

Bài học: `SELECT ... FOR UPDATE` trên parent table, vốn rất phổ biến, chặn mọi insert child table cho cùng parent. Nếu chỉ cần chặn người sửa dòng (không đụng key), dùng `FOR NO KEY UPDATE`. Trong Go chỉ cần viết thẳng `FOR NO KEY UPDATE` vào câu SQL (chương 10).

### Table lock

Mọi câu lệnh đều lấy một table lock; phần lớn là loại nhẹ nên không chặn nhau.

| Mode | Câu lệnh điển hình | Xung đột với |
|---|---|---|
| `ACCESS SHARE` | `SELECT` | chỉ `ACCESS EXCLUSIVE` |
| `ROW SHARE` | `SELECT ... FOR UPDATE/SHARE` | `EXCLUSIVE`, `ACCESS EXCLUSIVE` |
| `ROW EXCLUSIVE` | `INSERT`, `UPDATE`, `DELETE` | `SHARE` trở lên |
| `SHARE UPDATE EXCLUSIVE` | `VACUUM` thường, `CREATE INDEX CONCURRENTLY` | chính nó và mode mạnh hơn |
| `SHARE` | `CREATE INDEX` (không CONCURRENTLY) | chặn ghi |
| `ACCESS EXCLUSIVE` | `DROP TABLE`, `TRUNCATE`, `VACUUM FULL`, nhiều dạng `ALTER TABLE` | **mọi thứ kể cả SELECT** |

Cạm bẫy lớn nhất: `ALTER TABLE` xin `ACCESS EXCLUSIVE`. Nếu có một transaction dài đang giữ `ACCESS SHARE` (chỉ cần một `SELECT` trong transaction treo), `ALTER` phải **xếp hàng chờ**, và mọi query đến sau đều xếp **sau** `ALTER`: cả bảng đứng. Phòng ngừa: đặt `lock_timeout` ngắn cho migration (ví dụ `SET lock_timeout = '3s'`) và retry; giữ transaction ngắn.

### Advisory lock

Lock do ứng dụng định nghĩa theo con số, không gắn với dòng nào. Dạng nên dùng: theo transaction, tự nhả khi commit/rollback.

```sql
SELECT pg_advisory_xact_lock(42);       -- chờ cho tới khi lấy được
SELECT pg_try_advisory_xact_lock(42);   -- trả true/false ngay
```

Dùng cho "chỉ một job chạy mỗi lúc" hay bảo vệ đối tượng chưa có dòng. Dạng session-level (`pg_advisory_lock`) không dùng được với PgBouncer transaction pooling (chương 10). MySQL tương đương: `GET_LOCK('tên', timeout)` và `RELEASE_LOCK('tên')`, gắn với connection.

### Xem lock: `pg_locks`

Đã chạy (`lock_view`): A `UPDATE` dòng 1 rồi giữ; B `UPDATE` cùng dòng, bị chờ. Từ session A:

```sql
SELECT locktype, mode, granted, pid FROM pg_locks ... ;
SELECT pid, pg_blocking_pids(pid), wait_event_type, wait_event FROM pg_stat_activity
 WHERE cardinality(pg_blocking_pids(pid)) > 0;
```

Kết quả rút gọn:

```
relation      | acct | RowExclusiveLock | granted=t   (A)
relation      | acct | RowExclusiveLock | granted=t   (B)
transactionid | 777  | ExclusiveLock    | granted=t   (A giữ xid của mình)
transactionid | 777  | ShareLock        | granted=f   (B chờ xid của A)
tuple         | acct | ExclusiveLock    | granted=t   (B đứng đầu queue chờ dòng này)
blocking: pid B bị chặn bởi {pid A}, wait_event_type=Lock, wait_event=transactionid
```

Cách đọc: người chờ row lock thực chất chờ **transaction id** của người giữ (`ShareLock` trên `transactionid`, `granted = f`). `pg_blocking_pids()` cho biết ai chặn ai. Đây là công cụ số một khi debug (chương 12).

## 3. InnoDB (MySQL 9.7.4)

Lock của InnoDB gắn với **index record**, không phải với "dòng" theo nghĩa bảng. Các loại:

| Loại | Lock gì |
|---|---|
| Record lock | Một index record |
| Gap lock | Khoảng **giữa** hai index record, ngăn chèn vào khoảng đó |
| Next-key lock | Record lock + gap lock ngay trước record đó (mặc định ở `REPEATABLE READ`) |
| Insert intention lock | Loại gap lock đặc biệt do `INSERT` xin, chờ gap lock đang có |
| Intention lock `IS`/`IX` | Table-level, báo "bên trong có row-level lock" |

Gap lock chỉ có tác dụng chặn **insert**; hai transaction vẫn có thể cùng giữ gap lock lên cùng khoảng. Phần lớn gap lock biến mất ở `READ COMMITTED` (InnoDB gần như chỉ dùng record lock; gap vẫn còn dùng cho kiểm tra foreign key và duplicate key).

### Kịch bản `gap_lock` (đã chạy)

Bảng `t(id PK)` có hai dòng id=5 và id=30. A: `SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE` (không có dòng nào khớp). B (sau 1,5s): `INSERT INTO t VALUES (15,1)`.

`REPEATABLE READ`: B bị **chặn** chờ A. Từ `performance_schema.data_locks` trong lúc đó:

```
index_name | lock_type | lock_mode               | lock_status | lock_data
PRIMARY    | RECORD    | X,GAP                   | GRANTED     | 30          (A: gap trước id=30)
PRIMARY    | RECORD    | X,GAP,INSERT_INTENTION  | WAITING     | 30          (B: muốn chèn 15 vào gap đó)
NULL       | TABLE     | IX                      | GRANTED     | NULL        (intention lock của A, B)
```

`READ COMMITTED`: không có gap lock, `data_locks` chỉ còn lock `IX` table-level và B insert **xong ngay**.

Đây là nguồn gốc nhiều deadlock "khó hiểu" của InnoDB ở `REPEATABLE READ`: hai transaction cùng giữ gap lock rồi cùng xin insert intention vào khoảng đó (chương 6, chương 8 với SERIALIZABLE).

Thêm hai điều cần biết (theo tài liệu "InnoDB Locking"): (1) câu ghi/locking read mà **không có index dùng được** sẽ lock nhiều record hơn nhiều (có thể cả bảng); (2) tìm theo unique index với giá trị tồn tại chỉ cần record lock, không có gap lock. Hai điều này chưa được kiểm trong lab.

### Xem lock

```sql
-- Mỗi lock đang có hoặc đang chờ
SELECT engine_transaction_id, object_name, index_name, lock_type, lock_mode, lock_status, lock_data
FROM performance_schema.data_locks;
-- Ai chờ ai
SELECT requesting_engine_transaction_id, blocking_engine_transaction_id
FROM performance_schema.data_lock_waits;
```

Ngoài ra `SHOW ENGINE INNODB STATUS` (mục `TRANSACTIONS`, `LATEST DETECTED DEADLOCK`). Hai bảng `data_locks` và `data_lock_waits` thay thế `information_schema.INNODB_LOCKS`/`INNODB_LOCK_WAITS` đã bị loại bỏ từ MySQL 8.0.

## 4. So sánh

| | PostgreSQL | InnoDB |
|---|---|---|
| Row lock ở đâu | trong tuple (xmax) | trong bộ nhớ lock system, theo index record |
| Đọc có chặn ghi không | không (MVCC) | không (consistent read); locking read thì có |
| Chặn phantom bằng | predicate lock (SERIALIZABLE, không chờ) | gap/next-key lock |
| Lock theo số tự chọn | `pg_advisory_xact_lock` | `GET_LOCK` |
| Xem lock | `pg_locks`, `pg_stat_activity`, `pg_blocking_pids` | `performance_schema.data_locks`, `data_lock_waits` |

## 5. Cạm bẫy

1. `SELECT ... FOR UPDATE` trên parent table chặn insert child table (PG): dùng `FOR NO KEY UPDATE` khi đủ.
2. `ALTER TABLE` không có `lock_timeout`, xếp hàng sau transaction dài và chặn cả bảng.
3. Gap lock ở InnoDB `REPEATABLE READ` gây chờ và deadlock bất ngờ cho `INSERT`.
4. `UPDATE`/`DELETE` thiếu index trên MySQL lock rộng hơn dự kiến.
5. Dùng session-level advisory lock qua pooler transaction.

## 6. Tóm tắt

- PG có bốn mode row lock; `FOR KEY SHARE` (do FK) chỉ xung đột với `FOR UPDATE`. Đã chạy: update cột thường không chặn insert child, `FOR UPDATE` thì chặn.
- Table lock `ACCESS EXCLUSIVE` (ALTER, DROP, TRUNCATE) chặn cả SELECT và có hiệu ứng queue.
- InnoDB lock index record: record, gap, next-key, insert intention; `READ COMMITTED` hầu như không có gap lock (đã chạy).
- Xem lock: `pg_locks` + `pg_blocking_pids`; `performance_schema.data_locks` + `data_lock_waits`.

## 7. Tự kiểm tra

1. Vì sao `UPDATE` cột thường trên parent table không chặn insert child, còn `FOR UPDATE` thì chặn?
2. Hiệu ứng queue của `ACCESS EXCLUSIVE` là gì?
3. Gap lock là gì và vì sao `READ COMMITTED` giảm deadlock?
4. Hai query nào cho biết ai chặn ai trên PG và MySQL?

<details><summary>Đáp án</summary>

1. `UPDATE` thường xin `FOR NO KEY UPDATE`, tương thích với `FOR KEY SHARE` của FK; `FOR UPDATE` xung đột với `FOR KEY SHARE`.
2. Lệnh chờ lock mạnh cũng chặn các lệnh đến sau, nên một `ALTER` bị kẹt sau transaction dài làm cả bảng đứng.
3. Lock khoảng giữa các record để chặn insert; `READ COMMITTED` không dùng gap lock (đa số trường hợp) nên ít xung đột insert intention.
4. PG: `pg_blocking_pids(pid)` với `pg_stat_activity`. MySQL: `performance_schema.data_lock_waits`.
</details>
