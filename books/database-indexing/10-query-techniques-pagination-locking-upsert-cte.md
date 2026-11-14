# Chapter 10. Query Techniques: Keyset Pagination, Upsert, Row Locks, Counters, Deduplication, CTEs

## 10.1 Pagination: OFFSET gets slower, keyset stays stable

`OFFSET n LIMIT m` buộc database **đọc và bỏ** n dòng đầu. Trang càng sâu càng chậm. Keyset pagination (còn gọi seek method) nhớ **giá trị cuối trang trước** và dùng nó làm điểm bắt đầu cho index.

```sql
-- PostgreSQL, index (created_at, id) để thứ tự ổn định và duy nhất
CREATE INDEX orders_created_id_idx ON orders(created_at, id);

-- Trang sâu bằng OFFSET
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT id FROM orders ORDER BY created_at, id OFFSET 400000 LIMIT 20;
-- Index Only Scan ... (actual rows=400020.00)   Execution Time: ~146 ms   <- đọc 400.020 mục

-- Trang kế tiếp bằng keyset
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT id, created_at FROM orders
WHERE (created_at, id) > ('2024-06-01 00:00:00+00', 1000)
ORDER BY created_at, id LIMIT 20;
-- Index Only Scan ... Index Cond: ROW(created_at, id) > ROW(...) (actual rows=20.00)   ~0.1 ms
```
Thời gian của keyset không đổi theo độ sâu trang. Quy tắc: sort key phải **duy nhất** (thêm `id` vào cuối để phá hòa), và index phải khớp thứ tự.

**Lưu ý MySQL**: so sánh bộ giá trị `(a, b) > (x, y)` chạy được nhưng trong thử nghiệm 9.7.4 plan là `Filter` trên `Covering index scan` chứ không phải range seek (bắt đầu từ đầu index, lọc dần). Viết dạng khai triển để có range thật:

```sql
-- MySQL
EXPLAIN FORMAT=TRADITIONAL
SELECT id FROM orders
WHERE created_at > '2024-06-01' OR (created_at = '2024-06-01' AND id > 1000)
ORDER BY created_at, id LIMIT 20;
-- type: range, key: orders_created_id_idx, Extra: Using where; Using index
```
Nhược điểm của keyset: không nhảy tới "trang số 500" tùy ý. Với danh sách vô hạn cuộn, nhật ký, API cursor thì rất hợp.

## 10.2 Upsert

```sql
-- PostgreSQL
INSERT INTO counters (k, n) VALUES ('views', 1)
ON CONFLICT (k) DO UPDATE SET n = counters.n + EXCLUDED.n
RETURNING *;
```
```sql
-- MySQL 8.0.19+: dùng row alias; VALUES() trong ON DUPLICATE KEY UPDATE đã deprecated từ 8.0.20
INSERT INTO counters (k, n) VALUES ('views', 1) AS new
ON DUPLICATE KEY UPDATE n = counters.n + new.n;

-- Dạng cũ vẫn chạy trên 9.7.4 nhưng kèm cảnh báo:
INSERT INTO counters VALUES ('views', 1) ON DUPLICATE KEY UPDATE n = n + VALUES(n);
-- Warning 1287: 'VALUES function' is deprecated and will be removed in a future release.
--               Please use an alias (INSERT INTO ... VALUES (...) AS alias) and replace VALUES(col)
--               in the ON DUPLICATE KEY UPDATE clause with alias.col instead
```
Chỉ chèn nếu chưa có: PostgreSQL `ON CONFLICT DO NOTHING`; MySQL `INSERT IGNORE` (cẩn thận: `IGNORE` nuốt cả các lỗi khác).

## 10.3 RETURNING (PostgreSQL)

`INSERT/UPDATE/DELETE ... RETURNING` trả luôn các cột sau khi thay đổi, khỏi query thêm một lượt. MySQL **không** hỗ trợ `RETURNING` (dùng `LAST_INSERT_ID()` hoặc query lại).

```sql
-- PostgreSQL
WITH ins AS (
  INSERT INTO users (email, country, status, created_at) VALUES ('new1@example.com', 'VN', 'active', now())
  RETURNING id)
SELECT id FROM ins;
```

## 10.4 Counters and lock contention

Một dòng đếm duy nhất (`UPDATE counters SET n = n + 1 WHERE k = 'views'`) khiến mọi transaction xếp hàng chờ lock dòng đó. Giải pháp: chia counter thành nhiều "slot" ngẫu nhiên và cộng lại khi đọc.

```sql
-- PostgreSQL
CREATE TABLE page_hits (page_id int, slot smallint, n bigint NOT NULL DEFAULT 0,
                        PRIMARY KEY (page_id, slot));
INSERT INTO page_hits (page_id, slot, n) VALUES (7, (random()*7)::int, 1)
ON CONFLICT (page_id, slot) DO UPDATE SET n = page_hits.n + 1;
SELECT page_id, sum(n) FROM page_hits GROUP BY page_id;     -- đọc: cộng các slot
```
```sql
-- MySQL
CREATE TABLE page_hits (page_id INT, slot SMALLINT, n BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (page_id, slot));
INSERT INTO page_hits (page_id, slot, n) VALUES (7, FLOOR(RAND()*8), 1) AS new
ON DUPLICATE KEY UPDATE n = page_hits.n + new.n;
```
Nếu độ chính xác tức thời không cần, ghi vào bảng nhật ký (append-only) rồi gom định kỳ cũng tránh được contention.

## 10.5 Row locks at the database layer: `FOR UPDATE`

`SELECT ... FOR UPDATE` lock các dòng đọc được cho đến hết transaction, để "đọc rồi sửa" an toàn. Với job queue, thêm `SKIP LOCKED` để nhiều worker lấy các dòng khác nhau, không chờ nhau (có ở cả PostgreSQL 9.5+ và MySQL 8.0+):

```sql
-- PostgreSQL: lấy 2 job, đánh dấu đang chạy
WITH next AS (
  SELECT id FROM jobs WHERE state = 'queued' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED)
UPDATE jobs j SET state = 'running' FROM next WHERE j.id = next.id
RETURNING j.id, j.state;
```
```sql
-- MySQL
START TRANSACTION;
SELECT id FROM jobs WHERE state = 'queued' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED;
UPDATE jobs SET state = 'running' WHERE id IN (...);   -- các id vừa lấy
COMMIT;
```
Cần một **index khớp** (`WHERE state='queued' ORDER BY id`). PostgreSQL: partial index `CREATE INDEX jobs_queued ON jobs(id) WHERE state = 'queued';` (đã chạy thử) giữ index nhỏ khi hầu hết job đã xong. Trong InnoDB, `FOR UPDATE` lock theo index: không có index phù hợp có thể lock nhiều dòng hơn dự tính.

## 10.6 Deleting duplicate rows with a CTE

```sql
-- PostgreSQL: giữ dòng có id nhỏ nhất cho mỗi email
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY email ORDER BY id) AS rn FROM dup)
DELETE FROM dup USING ranked
WHERE dup.id = ranked.id AND ranked.rn > 1
RETURNING dup.id;      -- thử nghiệm: xóa 6 trong 9 dòng
CREATE UNIQUE INDEX dup_email ON dup(email);    -- chặn trùng từ giờ
```
```sql
-- MySQL 8.0+ (đã kiểm: DELETE chấp nhận WITH; hoặc dùng JOIN với bảng dẫn xuất)
WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) rn FROM dup)
DELETE FROM dup WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
```
Làm trên bảng lớn thì xóa theo batch, và nhớ backup.

## 10.7 CTEs: for readability, not an optimization fence

CTE (`WITH ... AS`) giúp chia query phức tạp thành các bước. Hiệu năng:
- PostgreSQL 12+: CTE không đệ quy, được dùng một lần, mặc định được **inline** như subquery (kết quả: `id = 5` được đẩy xuống và dùng `orders_pkey`). `AS MATERIALIZED` ép tính trước (`CTE Scan`), `AS NOT MATERIALIZED` ép inline. CTE được tham chiếu nhiều lần mặc định được materialize.
- MySQL 8.0+: optimizer tự quyết định merge hay materialize (kiểm bằng `EXPLAIN`).

## 10.8 Small tips

- `SELECT *` làm hỏng covering index và kéo cột lớn qua mạng; liệt kê cột cần.
- `COUNT(*)` trên bảng lớn luôn phải đếm thật (cả hai DB); nếu chỉ cần xấp xỉ, dùng statistics (`pg_class.reltuples`) hoặc counter riêng.
- `IN (1,2,3)` được tối ưu tốt (PostgreSQL: `= ANY` trên index); danh sách quá dài thì join với bảng tạm/`VALUES`.
- Cập nhật hàng loạt: chia lô, tránh giữ transaction dài (PostgreSQL gây bloat, InnoDB giữ undo).
- Đừng cộng số nguyên tự tạo "ID" bằng `MAX(id)+1`; dùng identity/auto-increment.

## 10.9 Common pitfalls

- Keyset pagination với sort key không duy nhất: trang bị trùng hoặc mất dòng.
- Giữ `VALUES()` trong `ON DUPLICATE KEY UPDATE`: deprecated từ 8.0.20.
- `INSERT IGNORE` làm mất thông báo lỗi dữ liệu thật.
- Dùng `FOR UPDATE` mà không có index khớp.
- Dùng `RETURNING` trong code chạy chung PostgreSQL/MySQL.

## 10.10 Summary

- Keyset pagination đọc đúng số dòng cần; OFFSET sâu đọc và bỏ tất cả dòng trước đó.
- Upsert: PG `ON CONFLICT`; MySQL `ON DUPLICATE KEY UPDATE ... AS alias` (không dùng `VALUES()`).
- Chia nhỏ counter nóng thành slot để tránh lock contention.
- `FOR UPDATE SKIP LOCKED` cho queue; luôn có index khớp.
- CTE trong PG 12+ mặc định không phải optimization fence; có `MATERIALIZED`/`NOT MATERIALIZED`.

## 10.11 Self-check

1. Vì sao `OFFSET 400000` chậm còn keyset thì không?
2. Viết lại `ON DUPLICATE KEY UPDATE n = n + VALUES(n)` theo cách không bị deprecated.
3. Làm sao giảm lock contention cho một counter cập nhật hàng nghìn lần/giây?
4. `SKIP LOCKED` dùng để làm gì?
5. Trên MySQL, vì sao nên viết keyset ở dạng `a > x OR (a = x AND b > y)`?

<details><summary>Answer</summary>

1. OFFSET phải đọc rồi loại 400.000 mục; keyset dùng giá trị cuối trang làm điểm bắt đầu trong index.
2. `INSERT ... VALUES (...) AS new ON DUPLICATE KEY UPDATE n = tbl.n + new.n`.
3. Chia thành nhiều dòng/slot ngẫu nhiên và cộng khi đọc, hoặc ghi nhật ký rồi gom.
4. Bỏ qua các dòng đang bị lock để nhiều worker lấy việc khác nhau, không chờ nhau.
5. Trong thử nghiệm 9.7.4, dạng so sánh bộ `(a,b) > (x,y)` chỉ thành `Filter` trên index scan, còn dạng khai triển cho range scan thật.
</details>
