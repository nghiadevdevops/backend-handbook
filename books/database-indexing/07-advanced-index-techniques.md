# Chapter 7. Advanced Index Techniques: Expression, Partial Index, Low-Cardinality Columns, "Ghost" Conditions, Size Limits, Unique and NULL

## 7.1 Expression index (functional index): each database does it differently

Khi không thể viết lại query để tránh bọc cột trong function (chương 3), ta index chính **kết quả của function**. Đây không phải "giải pháp chung cho mọi DB"; mỗi hệ có cú pháp và giới hạn riêng:

| Hệ | Cách làm | Ghi chú |
|---|---|---|
| PostgreSQL | `CREATE INDEX ON t ((lower(email)))` (ngoặc ngoài tùy function đơn giản) | Function phải `IMMUTABLE`. Query phải dùng **đúng expression** đó. |
| MySQL 8.0.13+ | `CREATE INDEX ... ON t ((LOWER(email)))` (**ngoặc đôi** bắt buộc) | Triển khai ngầm bằng generated column ẩn. |
| MySQL, mọi bản (kể cả cũ) | Tự tạo generated column + index trên cột đó | Phổ biến, chạy cả trên MariaDB (đối với MariaDB tôi chưa chạy thử). |
| SQL Server | computed column + index trên cột đó | Theo tài liệu, chưa chạy thử. |
| Oracle, SQLite | function-based / expression index | Theo tài liệu, chưa chạy thử. |

```sql
-- PostgreSQL
CREATE INDEX users_lower_email_idx ON users (lower(email));
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE lower(email) = 'user5@example.com';
-- Bitmap Index Scan on users_lower_email_idx (Index Cond: lower(email) = '...')
```
```sql
-- MySQL 8.0.13+
CREATE INDEX users_lower_idx ON users ((LOWER(email)));
EXPLAIN SELECT * FROM users WHERE LOWER(email) = 'user5@example.com';
-- -> Index lookup on users using users_lower_idx (lower(email) = 'user5@example.com')
```

Cạm bẫy riêng của PostgreSQL: function phải `IMMUTABLE`. `created_at::date` trên `timestamptz` **không** immutable (kết quả phụ thuộc time zone của session), nên:

```sql
-- PostgreSQL
CREATE INDEX bad_expr ON orders ((created_at::date));
-- ERROR: functions in index expression must be marked IMMUTABLE
CREATE INDEX orders_day_expr ON orders (((created_at AT TIME ZONE 'UTC')::date));   -- OK: cố định time zone
-- Query phải viết ĐÚNG expression này mới khớp:
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE (created_at AT TIME ZONE 'UTC')::date = '2024-06-01';
-- Bitmap Index Scan on orders_day_expr
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE created_at::date = '2024-06-01';
-- Seq Scan: expression khác nên không khớp index
```

Khi có thể, range trên cột gốc luôn tốt hơn (không tốn thêm index).

### Generated column: the MySQL version has a little magic

```sql
-- MySQL
ALTER TABLE orders
  ADD COLUMN created_day DATE GENERATED ALWAYS AS (DATE(created_at)) VIRTUAL,
  ADD INDEX orders_day_status (created_day, status);

EXPLAIN FORMAT=TRADITIONAL SELECT * FROM orders WHERE DATE(created_at) = '2024-06-01' AND status = 'paid';
-- key: orders_day_status    <- optimizer tự nhận ra expression khớp generated column
```
Ở MySQL (đã kiểm), query viết `DATE(created_at)` vẫn dùng được index của generated column vì expression trùng khớp.

PostgreSQL 12 trở lên cũng có generated column (`GENERATED ALWAYS AS (...) STORED`) và index trên nó; nhưng optimizer PostgreSQL **không** tự thay expression bằng generated column, bạn phải query theo tên cột:

```sql
-- PostgreSQL
ALTER TABLE orders ADD COLUMN created_day date
  GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED;
CREATE INDEX orders_day_status ON orders(created_day, status);
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE created_day = '2024-06-01' AND status = 'paid';
-- Index Scan using orders_day_status (Index Cond: created_day = ... AND status = 'paid')
```
Hai dạng này (generated column + multicolumn index) còn có lợi thế: gộp được với `status` thành một index.

## 7.2 Partial index (PostgreSQL only; MySQL does it differently)

Index chỉ chứa các dòng thỏa một điều kiện. Rất hợp với "việc đang mở", "chưa xóa", "hiếm gặp".

```sql
-- PostgreSQL
CREATE INDEX users_banned_idx ON users(id) WHERE status = 'banned';
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE status = 'banned';
-- Index Scan using users_banned_idx
SELECT pg_size_pretty(pg_relation_size('users_status_idx')) AS full_idx,
       pg_size_pretty(pg_relation_size('users_banned_idx')) AS partial_idx;
-- 2056 kB | 88 kB        (cùng 300.000 dòng, 1% là banned)
```

Điều kiện của query phải **suy ra được** predicate của index. Với index `ON orders(created_at) WHERE status IN ('new','paid')`: query `status = 'new' AND created_at >= ...` dùng được; query `created_at >= ...` không có `status` thì không dùng được index này (đã kiểm, planner chọn index khác).

MySQL **không có partial index**. Thay thế: generated column trả về NULL với dòng không cần index + index trên cột đó (NULL vẫn nằm trong index nhưng gọn), hoặc tách bảng.

## 7.3 Low-cardinality columns (boolean, status)

Index riêng trên cột chỉ có 2 đến 5 giá trị thường vô ích (chương 5): phần lớn dòng khớp thì sequential scan rẻ hơn. Nhưng "vô ích" không phải tuyệt đối: nó hữu ích khi **query tìm giá trị hiếm**.

```sql
-- PostgreSQL: cột active: 99,9% true, 0,1% false
CREATE INDEX flags_active ON flags(active);
EXPLAIN (COSTS OFF) SELECT * FROM flags WHERE active;       -- Seq Scan (đa số dòng khớp)
EXPLAIN (COSTS OFF) SELECT * FROM flags WHERE NOT active;   -- Index Scan using flags_active (hiếm)
```

Chiến lược:
- Đặt cột low-cardinality **vào multicolumn index** cùng cột tìm kiếm chính (`(status, created_at)`), hoặc làm partial index (PG) cho giá trị hiếm, thay vì index riêng.
- Với PostgreSQL 18 và MySQL (skip scan), một cột low-cardinality ở đầu index không còn "giết" index như trước (chương 2).

## 7.4 Turning a range into equality

Multicolumn secondary indexc vụ tốt nhất khi đa số cột dùng `=`. Nếu query thường lọc theo "khoảng thời gian" nhưng cũng chỉ cần độ phân giải theo ngày, ta thêm một cột **bucket** (ngày, tháng, nhóm giá) rồi dùng `=`/`IN` trên bucket. Ví dụ ở 7.1: cột `created_day`. Thay vì range qua `created_at`, query "ngày 2024-06-01, trạng thái paid" thành hai điều kiện `=`. Đánh đổi: thêm cột và thêm chi phí ghi; chỉ làm khi query đó rất nóng.

## 7.5 "Ghost" conditions: helping the database without changing results

Đôi khi bạn biết một **business constraint** mà database không biết; thêm điều kiện thừa (về mặt logic) cho nó một điểm bắt đầu.

Ví dụ: đơn hàng được giao trong tối đa 3 ngày sau khi tạo, `shipped_at` không có index, `created_at` có index. Tìm đơn giao ngày 2024-06-01:

```sql
-- PostgreSQL (MySQL tương tự)
-- Không có điều kiện ma: full table scan
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT count(*) FROM ship WHERE shipped_at >= '2024-06-01' AND shipped_at < '2024-06-02';
-- Parallel Seq Scan on ship     Execution Time: ~31 ms

-- Thêm điều kiện ma: đơn giao ngày D phải được tạo trong [D-3 ngày, D+1)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT count(*) FROM ship
WHERE shipped_at >= '2024-06-01' AND shipped_at < '2024-06-02'
  AND created_at  >= '2024-05-29' AND created_at  < '2024-06-02';
-- Index Scan using ship_created   (Index Cond: created_at ...)   Execution Time: ~1.5 ms
```
Kết quả đếm giống nhau, miễn business constraint thực sự đúng. Nếu constraint sai trong dữ liệu thật, bạn đã **âm thầm làm mất dòng**; nên có `CHECK` constraint hoặc kiểm tra định kỳ.

## 7.6 Searching by position: two conflicting range conditions

`WHERE lat BETWEEN a AND b AND lng BETWEEN c AND d`: multicolumn B-tree `(lat, lng)` chỉ dùng được range đầu (nguyên tắc 4). Hai index đơn có thể kết hợp (PostgreSQL: `BitmapAnd`). Giải pháp đúng cho dữ liệu hai chiều là spatial index:

```sql
-- PostgreSQL: dùng kiểu point/box có sẵn và GiST (không cần PostGIS)
CREATE INDEX pts_gist ON pts USING gist (point(lng, lat));
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT count(*) FROM pts WHERE point(lng, lat) <@ box(point(105, 10), point(105.2, 10.2));
-- Bitmap Index Scan on pts_gist (actual rows=58.00)
```
Với 200.000 điểm, hai B-tree đơn kết hợp bằng `BitmapAnd` chạy khoảng 2,5 ms và GiST khoảng 3,5 ms: hai cách tương đương ở quy mô này; lợi thế của spatial index lộ ra khi dữ liệu lớn hơn, và chủ yếu ở các nearest-neighbor query (chương 8).

```sql
-- MySQL: SPATIAL index trên cột POINT có SRID
CREATE TABLE pts (id INT AUTO_INCREMENT PRIMARY KEY, p POINT NOT NULL SRID 4326, SPATIAL INDEX sp (p));
EXPLAIN FORMAT=TRADITIONAL
SELECT COUNT(*) FROM pts
WHERE MBRContains(ST_GeomFromText('POLYGON((10 105,10 105.2,10.2 105.2,10.2 105,10 105))', 4326), p);
-- key: sp   (type: range)   -> kết quả 35 điểm trên 100.000
```
Lưu ý thứ tự trục: với SRID 4326 (hệ địa lý), `ST_GeomFromText` đọc WKT theo thứ tự (vĩ độ, kinh độ), còn `POINT(x, y)` trong `ST_SRID(POINT(...), 4326)` theo (kinh độ, vĩ độ) trong thử nghiệm ở 9.7.4. Sai thứ tự sẽ báo lỗi "latitude out of range" hoặc cho kết quả sai.

## 7.7 Size limit of an index entry

**PostgreSQL**: một entry B-tree (btree version 4) không được vượt khoảng 1/3 page, tức **2704 byte**. Giá trị lớn hơn (sau khi nén, nếu nén được) bị từ chối khi tạo index hoặc khi chèn:

```sql
-- PostgreSQL 18.6
CREATE TABLE big(t text);
CREATE INDEX big_idx ON big(t);
INSERT INTO big SELECT string_agg(md5(i::text), '') FROM generate_series(1,200) i;   -- 6400 ký tự không nén được
-- ERROR:  index row size 6416 exceeds btree version 4 maximum 2704 for index "big_idx"
-- DETAIL: Index row references tuple (0,1) in relation "big".
-- HINT:   Values larger than 1/3 of a buffer page cannot be indexed.
--         Consider a function index of an MD5 hash of the value, or use full text indexing.
```
Dạng thông báo hiện tại là `index row size N exceeds btree version 4 maximum 2704 ...`; các bản cũ ghi khác. Lưu ý: chuỗi lặp lại cao (ví dụ 5000 chữ `a`) nén được nên vẫn chèn được; giới hạn áp dụng cho kích thước *sau nén*.

Cách xử lý: index trên hash function (`CREATE INDEX ON big (md5(t))`, query `WHERE md5(t) = md5('...')`; đã kiểm dùng được, và nên thêm điều kiện so sánh đầy đủ để loại hash collision), hoặc `USING hash (t)` (index hash không bị giới hạn này, nhưng chỉ hỗ trợ `=`), hoặc full text search.

**MySQL InnoDB**: giới hạn 3072 byte cho index key (tổng các cột) với row format thông dụng:

```sql
-- MySQL 9.7.4
CREATE TABLE big (t VARCHAR(5000) CHARACTER SET utf8mb4);
CREATE INDEX big_idx ON big(t);
-- ERROR 1071 (42000): Specified key was too long; max key length is 3072 bytes
-- (utf8mb4 tốn tối đa 4 byte/ký tự; VARCHAR(700) = 2800 byte thì được)
CREATE INDEX big3_idx ON big3 (t(100));   -- prefix index: chỉ 100 ký tự đầu
```
Thay thế tốt hơn prefix: generated hash column và index trên đó, ví dụ `body_hash BINARY(32) GENERATED ALWAYS AS (UNHEX(SHA2(body, 256))) STORED, KEY (body_hash)`, query kèm `body = ...` để loại collision (đã kiểm: `key: body_hash`). Lưu ý riêng MySQL: từ **9.6**, các function `MD5()`, `SHA()`, `SHA1()` **không còn built-in** (gỡ bỏ sau khi bị đánh dấu deprecated từ 9.4); chạy thử trên 9.7.4 báo `FUNCTION ... does not exist`. Dùng `SHA2()`, hoặc cài component `component_classic_hashing` (function do component cung cấp không dùng được trong generated column, theo tài liệu MySQL). Ví dụ code cũ viết `SHA1(...)` hay `MD5(...)` trong schema MySQL sẽ vỡ khi nâng cấp.

## 7.8 Unique constraints and NULL

Theo chuẩn SQL, NULL không bằng NULL, nên `UNIQUE` cho phép **nhiều dòng NULL** (cả hai DB đã kiểm):

```sql
-- PostgreSQL
CREATE TABLE u1 (a int, b int, UNIQUE (a, b));
INSERT INTO u1 VALUES (1, NULL), (1, NULL);   -- thành công, 2 dòng
-- MySQL: giống
```

Muốn coi NULL là bằng nhau:

```sql
-- PostgreSQL 15+
CREATE TABLE u2 (a int, b int, UNIQUE NULLS NOT DISTINCT (a, b));
INSERT INTO u2 VALUES (1, NULL), (1, NULL);
-- ERROR: duplicate key value violates unique constraint "u2_a_b_key"  Key (a, b)=(1, null) already exists.
```
```sql
-- MySQL (không có NULLS NOT DISTINCT): dùng generated column quy NULL về giá trị đặc biệt
CREATE TABLE u2 (a INT, b INT,
  ab_key VARCHAR(30) GENERATED ALWAYS AS (CONCAT(a, '|', IFNULL(b, '~'))) VIRTUAL,
  UNIQUE (ab_key));
INSERT INTO u2 (a, b) VALUES (1, NULL), (1, NULL);   -- ERROR 1062: Duplicate entry '1|~' for key 'u2.ab_key'
```

**Unique chỉ cho dòng "còn sống"** (soft delete): email phải duy nhất trong số tài khoản chưa xóa.

```sql
-- PostgreSQL: partial unique index
CREATE UNIQUE INDEX acct_email_live ON acct(email) WHERE deleted_at IS NULL;
INSERT INTO acct(email) VALUES ('a@x.com');   -- OK
INSERT INTO acct(email) VALUES ('a@x.com');   -- ERROR: duplicate key value ...
UPDATE acct SET deleted_at = now() WHERE id = 1;
INSERT INTO acct(email) VALUES ('a@x.com');   -- OK
```
```sql
-- MySQL: unique trên generated column, NULL cho dòng đã xóa
CREATE TABLE acct (
  id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(100) NOT NULL, deleted_at DATETIME NULL,
  live_email VARCHAR(100) GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) VIRTUAL,
  UNIQUE KEY uq_live (live_email));
```
(`IF()` là function MySQL-only; PostgreSQL dùng `CASE`.) MySQL cũng có functional unique index: `CREATE UNIQUE INDEX u3_i ON u3 ((LOWER(e)))` chặn `'A'` và `'a'` (đã kiểm).

## 7.9 Common pitfalls

- PostgreSQL: expression không immutable, hoặc query viết khác expression trong index.
- MySQL: quên ngoặc đôi trong functional index.
- Tạo partial index rồi viết query không đủ điều kiện để planner dùng.
- Thêm "điều kiện ma" dựa trên giả định sai về dữ liệu.
- Mong `UNIQUE` chặn nhiều NULL (không chặn) hoặc phụ thuộc vào `MD5`/`SHA1` trong MySQL 9.6 trở lên.

## 7.10 Summary

- Functional index có cú pháp riêng ở mỗi DB: PG (function immutable, khớp đúng expression), MySQL 8.0.13+ (ngoặc đôi), hệ khác dùng computed/generated column.
- Partial index là công cụ mạnh của PostgreSQL; MySQL dùng generated column.
- Index trên cột low-cardinality chỉ nên đứng trong multicolumn index hoặc dạng partial.
- PostgreSQL: entry B-tree tối đa 2704 byte; MySQL InnoDB: key tối đa 3072 byte; cả hai cần hash hoặc prefix cho chuỗi dài.
- `UNIQUE` cho nhiều NULL; PG 15+ có `NULLS NOT DISTINCT`, MySQL dùng generated column.

## 7.11 Self-check

1. Vì sao `CREATE INDEX ON orders ((created_at::date))` lỗi trên PostgreSQL khi `created_at` là `timestamptz`?
2. Cú pháp functional index của MySQL khác PostgreSQL ở điểm nào dễ sai nhất?
3. Partial index `WHERE status IN ('new','paid')` có dùng được cho `WHERE created_at >= x` không? Vì sao?
4. Giới hạn kích thước entry B-tree của PostgreSQL là bao nhiêu và cách vượt?
5. Làm sao đảm bảo `email` duy nhất chỉ trong số tài khoản chưa xóa ở PostgreSQL và ở MySQL?

<details><summary>Answer</summary>

1. Phép cast `timestamptz` sang `date` phụ thuộc time zone của session nên không IMMUTABLE; dùng `AT TIME ZONE 'UTC'` trước khi cast.
2. MySQL cần ngoặc đôi `((LOWER(email)))`.
3. Không: query không bao hàm predicate của index nên planner không được phép dùng nó (có thể bỏ sót dòng).
4. 2704 byte (btree v4); dùng index trên hash (md5), index `hash`, hoặc full text search.
5. PostgreSQL: `CREATE UNIQUE INDEX ... (email) WHERE deleted_at IS NULL`. MySQL: generated column `IF(deleted_at IS NULL, email, NULL)` + UNIQUE.
</details>
