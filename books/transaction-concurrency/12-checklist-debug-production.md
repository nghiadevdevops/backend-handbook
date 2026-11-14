# Chương 12. Checklist debug concurrency incident trên production

## 1. Tình huống

03:10 sáng. Alert: p99 tăng vọt, một phần request timeout, CPU DB bình thường. Hoặc: khách báo số dư sai, nhưng log không có lỗi. Hai loại incident khác nhau: **kẹt** (chờ lock, deadlock, transaction treo) và **sai** (anomaly im lặng: lost update, write skew). Chương này là danh sách các bước để chẩn đoán, và chữa cháy an toàn.

Các query dưới đây đã được thử trên PostgreSQL 18.6 và MySQL 9.7.4 của lab (một số xem trong chương 5 và 6); luôn thử trên môi trường của bạn trước khi dựa vào chúng trong incident.

## 2. Loại 1: hệ thống kẹt

### Bước 1. Ai đang chờ ai?

PostgreSQL:

```sql
SELECT a.pid, a.state, now() - a.xact_start AS xact_age, a.wait_event_type, a.wait_event,
       pg_blocking_pids(a.pid) AS blocked_by, left(a.query, 80) AS query
FROM pg_stat_activity a
WHERE cardinality(pg_blocking_pids(a.pid)) > 0;
```

Lấy `blocked_by`, rồi hỏi tiếp: transaction đó đang làm gì?

```sql
SELECT pid, state, now() - xact_start AS xact_age, now() - state_change AS idle_for, query
FROM pg_stat_activity WHERE pid = <pid_chặn>;
```

Dấu hiệu kinh điển: `state = 'idle in transaction'`. Ai đó mở transaction, giữ lock, rồi không làm gì (gọi API chậm, quên commit, exception không rollback).

MySQL:

```sql
SELECT * FROM sys.innodb_lock_waits\G
-- hoặc thô hơn:
SELECT requesting_engine_transaction_id, blocking_engine_transaction_id
FROM performance_schema.data_lock_waits;
SELECT trx_id, trx_state, trx_started, trx_rows_locked, trx_mysql_thread_id
FROM information_schema.innodb_trx ORDER BY trx_started;
```

`trx_mysql_thread_id` là id dùng cho `KILL`. Transaction `trx_started` rất xưa là ứng viên.

### Bước 2. Có transaction dài không?

PG: `SELECT pid, now()-xact_start AS age, state, query FROM pg_stat_activity WHERE xact_start IS NOT NULL ORDER BY xact_start LIMIT 10;`. MySQL: query `innodb_trx` ở trên. Transaction dài giữ lock, và còn chặn cleanup (chương 4): VACUUM không dọn được, `history list length` tăng.

### Bước 3. Có `ALTER TABLE`/DDL đang xếp hàng không? (PG)

Trong kết quả bước 1, nếu `query` đầu queue chờ là `ALTER TABLE ...` và blocker của nó là một `SELECT` trong transaction treo thì mọi query khác đang xếp sau DDL (chương 5, queue effect). Hủy DDL (không phải transaction treo) giải phóng queue ngay.

### Bước 4. Hành động an toàn

| Việc | PostgreSQL | MySQL |
|---|---|---|
| Hủy câu lệnh đang chạy, giữ session | `SELECT pg_cancel_backend(pid);` | `KILL QUERY <thread_id>;` |
| Kết thúc cả session (rollback transaction) | `SELECT pg_terminate_backend(pid);` | `KILL <thread_id>;` |

Thứ tự ưu tiên: hủy **blocker ở đầu chuỗi** (kẻ không chờ ai), không phải victim. Rollback transaction lớn có thể tốn thời gian (đặc biệt InnoDB); đừng kill lặp đi lặp lại khi đang rollback. Ghi lại câu lệnh và `pid` trước khi kill để điều tra sau.

### Bước 5. Deadlock

- PG: tìm `deadlock detected` trong log; DETAIL ghi hai process và loại lock. Bật `log_lock_waits = on` để thấy cả những lần chờ vượt `deadlock_timeout`. Đếm: `SELECT datname, deadlocks FROM pg_stat_database;`.
- MySQL: `SHOW ENGINE INNODB STATUS\G` mục `LATEST DETECTED DEADLOCK` (chỉ deadlock gần nhất). Bật `innodb_print_all_deadlocks = ON` (mặc định OFF, đã kiểm) để ghi mọi deadlock vào error log.
- Đối chiếu code: hai code path nào lấy lock theo thứ tự ngược nhau (chương 6)?

## 3. Loại 2: dữ liệu sai nhưng không có lỗi

Không có cái gì "kẹt", bạn không thấy chờ lock. Hãy nghi ngờ anomaly:

1. **Tìm mẫu read-then-write.** Đoạn code nào đọc giá trị vào biến trong code rồi ghi lại (`bal := read(); write(bal + x)`)? Đó là lost update (chương 7).
2. **Tìm check-then-act.** `if (count(...) == 0) insert` hoặc `if (còn chỗ) đặt chỗ`. Đó là write skew/phantom (chương 8). Dấu vết trong dữ liệu: hai bản ghi tạo cách nhau vài mili giây vi phạm một quy tắc "chỉ một".
3. **Kiểm tra level thực tế:** PG `SHOW default_transaction_isolation;` hoặc `SHOW transaction_isolation;`. MySQL `SELECT @@transaction_isolation;`. Chương 3 nhắc: mặc định của cả hai đều cho phép các anomaly này.
4. **Có replica đọc không?** Nếu đọc từ replica rồi ghi vào primary, bạn đang quyết định trên dữ liệu cũ. (Nhiều framework có cơ chế "đọc primary sau khi vừa ghi", nhưng thường chỉ áp dụng trong cùng một request.)
5. **Dựng lại bằng hai session.** Chép mẫu kịch bản của `lab/scenarios/`, thay bảng của bạn. Nếu tái hiện được, bạn đã biết cần gì (chương 7 hoặc 8).
6. **Thêm constraint để lộ vấn đề:** `UNIQUE`, `CHECK`, hoặc exclusion constraint (PG). Dữ liệu sai sẽ biến thành lỗi rõ ràng thay vì im lặng.

## 4. Những tín hiệu cần monitor trước khi incident xảy ra

| Metric | PostgreSQL | MySQL |
|---|---|---|
| Transaction dài nhất | `max(now()-xact_start)` trên `pg_stat_activity` | `min(trx_started)` trên `innodb_trx` |
| Idle in transaction | `state='idle in transaction'` | `trx_state='RUNNING'` nhưng thread `Sleep` |
| Số deadlock | `pg_stat_database.deadlocks` | `information_schema.innodb_metrics` với `name='lock_deadlocks'` (đã kiểm; `SHOW GLOBAL STATUS` không có `Innodb_deadlocks`) |
| Chờ lock | `wait_event_type = 'Lock'` | `Innodb_row_lock_waits`, `Innodb_row_lock_time` |
| Cleanup backlog | `n_dead_tup`, tuổi `xmin` | `trx_rseg_history_len` (history list length) |
| Lỗi serialization/retry | đếm `40001`/`40P01` ở app | đếm `1213`/`1205` ở app |

Cài sẵn lưới an toàn:

```sql
-- PostgreSQL (đặt theo role/DB cho ứng dụng web, vì mặc định 0 = tắt)
ALTER ROLE app SET lock_timeout = '5s';
ALTER ROLE app SET statement_timeout = '30s';
ALTER ROLE app SET idle_in_transaction_session_timeout = '60s';
```

MySQL: giảm `innodb_lock_wait_timeout` (mặc định 50 giây) cho tải web; kết hợp `max_execution_time` cho `SELECT`.

## 5. Checklist một trang

1. Kẹt hay sai? (có chờ/timeout/deadlock, hay chỉ dữ liệu lệch)
2. Kẹt: lấy danh sách chờ (`pg_blocking_pids` / `data_lock_waits`), tìm blocker đầu chuỗi.
3. Xem tuổi transaction của blocker; `idle in transaction`? DDL xếp hàng?
4. Hủy câu lệnh trước (`pg_cancel_backend`/`KILL QUERY`), kết thúc session sau.
5. Ghi lại câu lệnh, thời gian, nguồn (route, job) trước khi dọn.
6. Sau incident: đặt `lock_timeout`, `idle_in_transaction_session_timeout`, bật `log_lock_waits`/`innodb_print_all_deadlocks`.
7. Sai: tìm read-then-write và check-then-act; tái hiện bằng hai session; sửa bằng atomic update, lock, version, constraint hoặc SERIALIZABLE + retry.
8. Thêm retry có giới hạn cho lỗi `40001`/`40P01`/`1213`.
9. Thêm test hoặc script tái hiện vào repo để lỗi không quay lại.

## 6. Cạm bẫy

1. Kill victim thay vì blocker.
2. Kill transaction lớn của InnoDB rồi kill tiếp vì "chưa thấy hết": rollback đang chạy.
3. Tăng timeout để "hết lỗi", che giấu transaction treo.
4. Sửa triệu chứng (retry) mà không tìm gốc (thứ tự lock, transaction quá rộng).
5. Không monitor idle-in-transaction cho tới khi incident.

## 7. Tóm tắt

- Phân loại trước: kẹt hay sai.
- Kẹt: tìm wait chain, blocker đầu chuỗi, tuổi transaction, DDL xếp hàng; hủy câu lệnh rồi mới kill session.
- Sai im lặng: nghi read-then-write và check-then-act, kiểm level, tái hiện bằng hai session.
- Đặt sẵn timeout và monitor transaction dài.
- Cuối cùng luôn thêm retry và test.

## 8. Tự kiểm tra

1. Query nào cho biết transaction nào đang chặn một câu `UPDATE` bị kẹt trên PG?
2. Vì sao hủy `ALTER TABLE` đang xếp hàng có thể cứu cả hệ thống?
3. Đặt `idle_in_transaction_session_timeout` để làm gì?
4. Dữ liệu lệch không có lỗi: hai mẫu code cần tìm đầu tiên?

<details><summary>Đáp án</summary>

1. `pg_blocking_pids(pid)` trong `pg_stat_activity`, rồi tra pid chặn.
2. Mọi query đến sau xếp sau DDL; hủy DDL gỡ queue.
3. Tự hủy session mở transaction mà không làm gì, tránh giữ lock và chặn cleanup.
4. Đọc-rồi-ghi (lost update) và check-then-act (write skew/phantom).
</details>
