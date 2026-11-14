# Chapter 9. Write Cost, Index Maintenance and Dropping Unused Indexes

## 9.1 What an index costs

Trong bảng thử nghiệm `orders` (500.000 dòng) của PostgreSQL, sau khi ta thử nhiều index khác nhau:

```sql
-- PostgreSQL
SELECT pg_size_pretty(pg_relation_size('orders'))  AS heap,
       pg_size_pretty(pg_indexes_size('orders'))   AS all_indexes;
--  heap = 39 MB | all_indexes = 99 MB      <- index gấp 2,5 lần dữ liệu
```
Mỗi `INSERT` phải ghi vào mọi index đó. Đó là lý do cần dọn index không dùng.

## 9.2 UPDATE and indexes: PostgreSQL and InnoDB differ

### PostgreSQL: HOT update

Vì MVCC, `UPDATE` tạo một row version mới. Điều kiện để là **HOT update** (Heap-Only Tuple):

1. Không cột nào **nằm trong bất kỳ index nào** bị thay đổi, và
2. Page heap còn chỗ trống để chứa phiên bản mới.

Khi HOT, không index nào cần thêm entry mới: ghi rẻ hơn nhiều và ít bloat. Thí nghiệm (bảng 10.000 dòng, `fillfactor = 70` để chừa chỗ trống trong page):

```sql
-- PostgreSQL
CREATE TABLE hot_t (id int PRIMARY KEY, a int, b int) WITH (fillfactor = 70);
CREATE INDEX hot_a ON hot_t(a);
INSERT INTO hot_t SELECT g, g, g FROM generate_series(1, 10000) g;
VACUUM hot_t;

UPDATE hot_t SET b = b + 1 WHERE id <= 1000;                 -- b không có index
SELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'hot_t';
--  n_tup_upd = 1000 | n_tup_hot_upd = 448

UPDATE hot_t SET a = a + 1 WHERE id BETWEEN 2001 AND 3000;   -- a CÓ index
-- n_tup_upd = 2000 | n_tup_hot_upd = 448    (không thêm HOT nào)
```
Cập nhật cột không index: 448/1000 là HOT (số còn lại hết chỗ trong page, vì đây là lần đầu sau khi nạp và `fillfactor` chỉ chừa 30%). Cập nhật cột có index: 0 HOT. Trên bảng `orders` (đóng đầy page, `fillfactor` 100) lần thử đầu cho 0 HOT dù cột `note` không có index, vì hết chỗ trống. Bài học thực tế: (a) đừng index cột hay bị sửa nếu không cần; (b) bảng hay bị `UPDATE` nên giảm `fillfactor` (ví dụ 80 đến 90) để có chỗ cho HOT.

### MySQL InnoDB

Sửa cột **không nằm trong index** nào: chỉ đổi dòng trong B-tree của primary key (có ghi undo log); **secondary index không bị đụng**. Sửa cột nằm trong một secondary index: entry cũ bị đánh dấu xóa và entry mới được chèn trong index đó. Sửa chính cột primary key là việc đắt nhất (di chuyển dòng, và cập nhật mọi secondary index vì chúng chứa giá trị PK).

## 9.3 Finding unused indexes

### PostgreSQL: `pg_stat_all_indexes`

Cột tên bảng là **`relname`** (không phải `tablename`), tên index là **`indexrelname`**. Các cột của view trong PostgreSQL 18: `relid, indexrelid, schemaname, relname, indexrelname, idx_scan, last_idx_scan, idx_tup_read, idx_tup_fetch`. (Cột `stats_reset` mới xuất hiện trong ghi chú của PostgreSQL 19 đang ở giai đoạn release candidate; PG 18 thì chưa có.)

Khi tìm index thừa **phải loại index primary key và UNIQUE**, vì chúng có thể `idx_scan = 0` mà vẫn đang bảo vệ data integrity:

```sql
-- PostgreSQL
SELECT s.relname, s.indexrelname, s.idx_scan, s.last_idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_all_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND NOT i.indisunique          -- loại UNIQUE
  AND NOT i.indisprimary         -- loại PRIMARY KEY
  AND s.idx_scan = 0
ORDER BY pg_relation_size(s.indexrelid) DESC;
```
Kết quả thử nghiệm: `orders_status_amount_idx` 20 MB, `users_lower_email_idx` 12 MB, `users_created_idx` 6,6 MB... đều `idx_scan = 0` (đây là các index tôi tạo để thử ở các chương trước).

Hai lưu ý về độ tin cậy của con số:

- **Statistics của PostgreSQL được giữ qua clean shutdown** từ PostgreSQL 15 (trước đó mất khi restart). Đã kiểm: `idx_scan = 4` cho một index, sau `docker restart` vẫn là 4. Nhưng sau crash, hoặc sau `pg_stat_reset()`, statistics mất; và các replica có statistics riêng. Đừng xóa index chỉ vì một ngày quan sát: hãy đợi qua chu kỳ nghiệp vụ đầy đủ (cuối tháng, báo cáo quý) và kiểm tra cả các replica nếu có đọc từ đó.
- `idx_scan = 0` không có nghĩa index vô dụng nếu nó đang chặn trùng lặp (UNIQUE) hoặc phục vụ foreign key.

**Duplicate index** (cùng cột, cùng kiểu, cùng điều kiện) cũng là thừa. Query tìm nhóm giống nhau:

```sql
-- PostgreSQL
SELECT indrelid::regclass AS tbl, array_agg(indexrelid::regclass) AS dup_indexes
FROM pg_index
GROUP BY indrelid, indkey, indclass, indpred::text, indexprs::text
HAVING count(*) > 1;
--  users | {users_email_idx, users_email_like_idx}     <- tôi tạo trùng ở chương 3 trong lúc thử
```

### MySQL: `performance_schema` and `sys`

```sql
-- MySQL
SELECT object_name, index_name FROM sys.schema_unused_indexes WHERE object_schema = 't';
SELECT index_name, count_star FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema = 't' AND object_name = 'users';
```
**Số liệu của `performance_schema` là in-memory và bị mất khi server restart** (khác PostgreSQL). Đã kiểm: counter của `users_created_idx` là 300.001 trước khi restart container và không còn dòng nào sau đó. `sys.schema_unused_indexes` chỉ phản ánh khoảng từ lần khởi động gần nhất, nên nếu server vừa restart thì mọi index trông như "không dùng". Với MySQL, lấy mẫu định kỳ vào bảng riêng nếu cần quan sát dài.

### How to drop an index safely

```sql
-- MySQL: đặt INVISIBLE trước, quan sát, rồi mới DROP
ALTER TABLE users ALTER INDEX users_status_idx INVISIBLE;   -- optimizer bỏ qua, index vẫn được cập nhật
-- ... nếu có vấn đề: ALTER TABLE users ALTER INDEX users_status_idx VISIBLE;
```
PostgreSQL không có invisible index built-in. Cách thử: trong transaction, `BEGIN; DROP INDEX x; EXPLAIN ...; ROLLBACK;` (đã chạy thử: sau khi bỏ `users_status_idx` trong transaction, `status = 'banned'` chuyển sang `users_banned_idx`; lưu ý lệnh này giữ lock mạnh trên bảng cho đến khi kết thúc transaction, nên không làm trên bảng nóng đang production). Sau khi chắc, `DROP INDEX CONCURRENTLY x;`.

## 9.4 Maintenance: bloat and creating/rebuilding indexes without blocking writes

- **PostgreSQL**: `CREATE INDEX CONCURRENTLY` và `REINDEX INDEX CONCURRENTLY` xây index mà không chặn ghi (chậm hơn, không dùng trong transaction block). Đã chạy thử cả hai. Index phình do bloat sau nhiều UPDATE/DELETE được dọn bằng `REINDEX ... CONCURRENTLY`; dữ liệu phình dọn bằng `VACUUM` (lệnh `VACUUM FULL` và `CLUSTER` lock bảng hoàn toàn).
- **MySQL InnoDB**: hầu hết `CREATE INDEX`/`DROP INDEX` là online (in-place, cho phép đọc ghi đồng thời). Phình dọn bằng `OPTIMIZE TABLE` hoặc `ALTER TABLE ... ENGINE=InnoDB` (xây lại bảng; cân nhắc công cụ online schema change với bảng rất lớn).

## 9.5 Common pitfalls

- Query `pg_stat_all_indexes` với cột `tablename` (không tồn tại, đúng là `relname`).
- Xóa index PK/UNIQUE chỉ vì `idx_scan = 0`.
- Tin số liệu MySQL sau khi vừa restart.
- Index cột hay bị sửa, làm mất khả năng HOT update.
- Quên rằng duplicate index vẫn bị cập nhật mỗi lần ghi.

## 9.6 Summary

- Index có thể to gấp nhiều lần dữ liệu và làm chậm mọi lần ghi.
- PostgreSQL HOT update cần: không đổi cột có index và còn chỗ trong page; InnoDB không đụng secondary index khi cột không nằm trong index.
- `pg_stat_all_indexes(relname, indexrelname, idx_scan, ...)`, nhớ loại PK/UNIQUE; statistics PG được giữ qua clean shutdown (từ PG 15).
- `performance_schema` của MySQL mất khi restart; dùng `INVISIBLE` để thử trước khi xóa.
- Dùng `CONCURRENTLY` (PG) hoặc DDL online (MySQL) để bảo trì không chặn ghi.

## 9.7 Self-check

1. Hai điều kiện để một UPDATE trên PostgreSQL là HOT?
2. Vì sao query tìm index thừa phải loại `indisunique` và `indisprimary`?
3. Statistics index của PostgreSQL và MySQL khác nhau ra sao khi restart?
4. Cách thử xóa index an toàn hơn trên MySQL?
5. Tên cột đúng của bảng trong `pg_stat_all_indexes` là gì?

<details><summary>Answer</summary>

1. Không cột nào nằm trong index bị đổi và page còn chỗ trống cho row version mới.
2. Chúng bảo vệ uniqueness/integrity dù có thể không bao giờ được dùng để quét.
3. PostgreSQL (từ 15) giữ statistics qua clean shutdown; `performance_schema` MySQL mất khi restart.
4. `ALTER TABLE ... ALTER INDEX x INVISIBLE`, quan sát, rồi mới DROP.
5. `relname` (index là `indexrelname`).
</details>
