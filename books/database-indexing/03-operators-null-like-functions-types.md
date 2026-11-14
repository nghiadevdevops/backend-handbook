# Chương 3. Operator, NULL, LIKE, function bọc cột và data type: khi nào index dùng được

Nguyên tắc xuyên suốt từ chương 2: B-tree cần một **điểm bắt đầu** và một **hướng quét**. Một điều kiện "dùng được index" khi nó cho database biết nên đặt con trỏ ở đâu trong thứ tự của index.

Dữ liệu: `users` 300.000 dòng; `status` có 2 giá trị (`active` 99%, `banned` 1%), `country` 5 giá trị, `name` NULL ở 10% dòng, `deleted_at` NULL ở 95% dòng.

## 3.1 `!=` / `<>` và `LIKE '%x'`: hiểu đúng lý do

Lời giải thích sai thường gặp: "optimizer không ước lượng được số dòng nên bỏ index". Sai. Optimizer ước lượng bình thường:

```sql
-- PostgreSQL
EXPLAIN SELECT * FROM users WHERE status <> 'banned';
```
```
-- PostgreSQL 18.6 (rút gọn)
Seq Scan on users (cost=0.00..7114.00 rows=296810 ...)   -- ước lượng rất sát (thực tế 297.000)
```

Lý do thật nằm ở cấu trúc:

- Khoảng "mọi thứ khác giá trị này" không có một điểm bắt đầu duy nhất; nó gồm hai đoạn rời nhau (nhỏ hơn và lớn hơn).
- Với PostgreSQL, operator `<>` **không thuộc operator class của B-tree** (B-tree chỉ có `<`, `<=`, `=`, `>=`, `>`), nên không thể là điều kiện index. Hãy xem bằng chứng: viết lại thành hai đoạn thì dùng được.

```sql
-- PostgreSQL
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE status <> 'active';
-- Parallel Seq Scan (Filter: status <> 'active')   <- dù chỉ ~1% dòng khớp

EXPLAIN (COSTS OFF) SELECT * FROM users WHERE status < 'active' OR status > 'active';
-- Bitmap Heap Scan -> BitmapOr -> 2 x Bitmap Index Scan on users_status_idx
```

MySQL xử lý khác: nó có thể biến `<>` thành range hai đoạn khi đủ chọn lọc, và bỏ qua khi không:

```sql
-- MySQL
EXPLAIN SELECT * FROM users WHERE status <> 'active';   -- ~1% dòng
-- -> Index range scan using users_status_idx over (status < 'active') OR ('active' < status)
EXPLAIN SELECT * FROM users WHERE status <> 'banned';   -- ~99% dòng
-- -> Table scan (Filter: status <> 'banned')
```

Cùng một operator, hai kết quả khác nhau: không có luật "`!=` không bao giờ dùng index". Có luật: **khi phần lớn bảng khớp, full table scan là đúng** (xem chương 5), và với PostgreSQL thì còn phải tự viết lại thành range nếu muốn dùng B-tree.

`LIKE '%x'` (wildcard ở đầu): không có prefix cố định, nên không có điểm bắt đầu. Cả hai DB đều full table scan. Giải pháp thật sự là index loại khác (trigram ở chương 8) chứ không phải mẹo viết lại.

## 3.2 NULL

- `IS NULL` và `IS NOT NULL` dùng được index B-tree ở cả hai DB (NULL được lưu trong index).

```sql
-- PostgreSQL
CREATE INDEX users_deleted_idx ON users(deleted_at);
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE deleted_at IS NOT NULL;
-- Index Scan using users_deleted_idx (Index Cond: deleted_at IS NOT NULL)
```
```sql
-- MySQL
EXPLAIN SELECT * FROM users WHERE deleted_at IS NOT NULL;
-- -> Index range scan using users_deleted_idx over (NULL < deleted_at)
```

Quy tắc cần nhớ:

- `col = NULL` không bao giờ đúng; phải dùng `IS NULL`. `col <> 5` bỏ qua dòng NULL (kết quả `UNKNOWN`).
- `NOT IN (subquery)` gặp NULL trong danh sách sẽ không trả dòng nào. Ưu tiên `NOT EXISTS`.
- Thứ tự sắp xếp NULL: PostgreSQL coi NULL **lớn nhất** (đứng cuối khi `ASC`, **đứng đầu khi `DESC`**). MySQL coi NULL **nhỏ nhất** (đứng đầu khi `ASC`, cuối khi `DESC`). Thử nghiệm:

```sql
-- PostgreSQL
SELECT name FROM users WHERE id BETWEEN 1 AND 12 ORDER BY name DESC LIMIT 3;
-- dòng đầu là NULL, rồi 'Name 9', 'Name 8'
```
```sql
-- MySQL
SELECT name FROM users WHERE id BETWEEN 1 AND 12 ORDER BY name DESC LIMIT 3;
-- 'Name 9', 'Name 8', 'Name 7'   (NULL ở cuối)
```

PostgreSQL cho phép chỉ rõ `NULLS FIRST` / `NULLS LAST`; MySQL thì không có cú pháp này (dùng `ORDER BY col IS NULL, col`). Trường hợp hay gặp ở `DISTINCT ON`, xem chương 4.

- `UNIQUE` cho phép nhiều NULL ở cả hai DB (chi tiết ở chương 7).

## 3.3 `LIKE 'abc%'` trên PostgreSQL: bẫy collation

`LIKE 'abc%'` có prefix cố định, về lý thuyết là range `>= 'abc' AND < 'abd'`. Nhưng trên PostgreSQL, B-tree mặc định sắp xếp theo **collation của cột**, và với các collation ngôn ngữ (ví dụ `en_US.utf8`, mặc định của image Docker dùng để thử) thứ tự chuỗi không phải thứ tự byte, nên range prefix không hợp lệ. Kết quả thử nghiệm:

```sql
-- PostgreSQL (database collation: en_US.utf8)
CREATE INDEX users_email_idx2 ON users(email);
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE email LIKE 'user77777%';
-- Parallel Seq Scan  <- KHÔNG dùng index
```

Hai cách sửa, đều đã chạy thử:

```sql
-- PostgreSQL, cách 1: operator class dành cho pattern matching
CREATE INDEX users_email_pattern_idx ON users(email text_pattern_ops);   -- varchar_pattern_ops cho varchar
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE email LIKE 'user77777%';
-- Index Scan using users_email_pattern_idx
--   Index Cond: (email ~>=~ 'user77777') AND (email ~<~ 'user77778')

-- PostgreSQL, cách 2: index với collation "C"
CREATE INDEX users_email_c_idx ON users(email COLLATE "C");
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE email LIKE 'user77777%' COLLATE "C";
-- Index Scan using users_email_c_idx
```

Hạn chế: index `text_pattern_ops` **không** phục vụ `ORDER BY email` hay `email = 'x'` theo thứ tự collation (nó phục vụ `=` nhưng không phục vụ `<`, `>` theo collation). Nếu cần cả hai, giữ hai index hoặc đặt cột là `COLLATE "C"` ngay từ đầu. Database tạo với collation `C` (hoặc cột khai báo `COLLATE "C"`) thì index mặc định dùng được cho `LIKE 'abc%'`.

MySQL không có bẫy này: với collation `utf8mb4_0900_ai_ci`, `LIKE 'user77777%'` chạy range scan bình thường.

```sql
-- MySQL
EXPLAIN SELECT * FROM users WHERE email LIKE 'user77777%';
-- -> Index range scan on users using users_email_idx over ('user77777' <= email <= 'user77777...')
```

Lưu ý với MySQL: collation `_ci` (case-insensitive) nghĩa là `LIKE 'USER%'` cũng khớp `user...`. Với PostgreSQL, `LIKE` là case-sensitive; `ILIKE` thì không dùng được index B-tree thường.

## 3.4 Đừng bọc cột trong function

Điều kiện `f(cột) = giá trị` làm database mất điểm bắt đầu trong index của `cột`, vì index sắp theo `cột`, không theo `f(cột)`. Viết lại thành range trên chính cột.

```sql
-- PostgreSQL
CREATE INDEX users_created_idx ON users(created_at);

-- Xấu: bọc cột trong function
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE date_trunc('day', created_at) = '2024-02-01';
-- Parallel Seq Scan
-- Tốt: range nửa mở
EXPLAIN (COSTS OFF) SELECT * FROM users
WHERE created_at >= '2024-02-01' AND created_at < '2024-02-02';
-- Index Scan using users_created_idx
```

Lọc theo cả một năm hay một tháng cũng viết như vậy: `created_at >= '2024-01-01' AND created_at < '2025-01-01'`, không dùng `EXTRACT(YEAR FROM created_at) = 2024` (thử nghiệm cho thấy PostgreSQL quét toàn bảng với dạng `EXTRACT`).

```sql
-- MySQL
EXPLAIN SELECT * FROM users WHERE DATE(created_at) = '2024-02-01';   -- Table scan
EXPLAIN SELECT * FROM users WHERE MONTH(created_at) = 2;              -- Table scan
EXPLAIN SELECT * FROM users WHERE created_at >= '2024-02-01' AND created_at < '2024-02-02';
-- -> Index range scan using users_created_idx
```

Hai ngoại lệ chính đáng: nếu **không thể** viết lại (ví dụ `lower(email) = ...` khi dữ liệu có hoa thường lẫn lộn), dùng **expression index** (chương 7). Ngoài ra, function áp lên **giá trị constant** bên phải dấu `=` thì không sao.

## 3.5 Data type không khớp

- **PostgreSQL**: so sánh khác type hoặc báo lỗi, hoặc cast theo quy tắc rõ ràng. String literal `'12345'` được hiểu là type của cột, nên `id = '12345'` vẫn dùng index. Nhưng so sánh với type `numeric` buộc cast **cột** sang numeric và mất index:

```sql
-- PostgreSQL
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE id = '12345';          -- Index Scan using users_pkey
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE id = 12345::numeric;   -- Seq Scan, Filter: (id)::numeric = 12345
-- SELECT ... WHERE email = 5::int8;  ->  ERROR: operator does not exist: text = bigint
```

- **MySQL**: implicit cast rất rộng rãi, và đây là nguồn bẫy thật:

```sql
-- MySQL
EXPLAIN SELECT * FROM users WHERE email = 12345;   -- cột chuỗi so với số: Table scan (cast CỘT sang số)
EXPLAIN SELECT * FROM users WHERE id = '12345';    -- cột số so với chuỗi: dùng PK bình thường
SELECT COUNT(*) FROM users WHERE id = '12abc';     -- 1 dòng khớp id = 12, kèm Warning 1292 Truncated incorrect DOUBLE value
```

Quy tắc: so sánh cột chuỗi với **string literal**, cột số với số. Dùng parameterized query và kiểm tra type ở application layer.

## 3.6 Cạm bẫy thường gặp

- Khẳng định "`!=` không dùng index vì không ước lượng được": sai, xem 3.1.
- `LIKE 'abc%'` trên PostgreSQL mà quên `text_pattern_ops` hay collation `C`.
- `WHERE EXTRACT(...)`, `DATE(col)`, `MONTH(col)` bọc cột (MySQL: `DATE`, `MONTH`; PostgreSQL: `date_trunc`, `EXTRACT`).
- `NOT IN` với danh sách có NULL.
- MySQL: so sánh cột chuỗi với số.

## 3.7 Tóm tắt

- Index B-tree cần điểm bắt đầu: `=`, range, prefix cố định thì được; `<>` (PG) và `%x` thì không.
- Optimizer vẫn ước lượng được `<>`; lý do thật là cấu trúc B-tree và operator class.
- PostgreSQL: `LIKE 'abc%'` cần `text_pattern_ops`/`varchar_pattern_ops` hoặc collation `"C"`.
- Viết lại `function(cột) = x` thành range trên cột; nếu không được, dùng expression index.
- Giữ type của constant khớp type của cột; MySQL implicit cast rất dễ mất index.

## 3.8 Tự kiểm tra

1. Vì sao PostgreSQL không dùng B-tree cho `status <> 'active'` dù chỉ 1% dòng khớp, còn MySQL lại có thể?
2. Hai cách làm `LIKE 'abc%'` dùng index trên PostgreSQL với collation `en_US.utf8`?
3. Viết lại `WHERE EXTRACT(YEAR FROM created_at) = 2024` để dùng index trên `created_at`.
4. NULL được sắp ở đâu khi `ORDER BY name DESC` trên PostgreSQL và trên MySQL?
5. Trên MySQL, `WHERE email = 12345` (email là VARCHAR) có dùng index trên `email` không, và vì sao?

<details><summary>Đáp án</summary>

1. `<>` không thuộc operator class B-tree của PostgreSQL, nên không là điều kiện index; MySQL chuyển thành range hai đoạn khi đủ chọn lọc.
2. Index với `text_pattern_ops` (hoặc `varchar_pattern_ops`); hoặc index/cột với collation `"C"`.
3. `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`.
4. PostgreSQL: NULL đứng đầu (NULL lớn nhất). MySQL: NULL đứng cuối (NULL nhỏ nhất).
5. Không: MySQL cast cột chuỗi sang số để so sánh, nên không dùng được index (thử nghiệm: Table scan).
</details>
