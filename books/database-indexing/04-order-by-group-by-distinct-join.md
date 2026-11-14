# Chapter 4. ORDER BY, GROUP BY, DISTINCT, JOIN, Subqueries, UPDATE/DELETE

## 4.1 ORDER BY: let the index do the sorting

Index B-tree đã sắp xếp sẵn. Nếu thứ tự `ORDER BY` trùng thứ tự index (sau các cột lọc bằng `=`), database đọc index theo thứ tự và **không cần bước sort**, đặc biệt quý với `LIMIT`.

```sql
-- PostgreSQL
-- Chưa có index trên created_at
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
-- Limit -> Gather Merge -> Sort (Sort Key: created_at DESC) -> Parallel Seq Scan   ~43 ms

CREATE INDEX orders_created_idx ON orders(created_at);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
-- Limit -> Index Scan Backward using orders_created_idx   ~0.13 ms
```

### Without an index: top-N, no full sort

Hiểu sai thường gặp: "không có index thì `ORDER BY ... LIMIT 10` sort cả bảng". Thực tế database vẫn **đọc mọi dòng khớp điều kiện**, nhưng chỉ giữ 10 dòng tốt nhất trong một heap nhỏ (priority queue), gọi là *top-N heapsort*:

```sql
-- PostgreSQL
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT * FROM orders WHERE status = 'paid' ORDER BY amount DESC LIMIT 10;
-- Sort Key: amount DESC
--   Sort Method: top-N heapsort  Memory: 26kB     <- chỉ 26 KB, không sort 100.000 dòng
--   -> Parallel Seq Scan ... Filter: status = 'paid'
```

```sql
-- MySQL
EXPLAIN FORMAT=TREE SELECT * FROM orders WHERE status = 'paid' ORDER BY amount DESC LIMIT 10;
-- -> Limit: 10 row(s)
--    -> Sort: orders.amount DESC, limit input to 10 row(s) per chunk
```

Vậy chi phí là *đọc hết dòng khớp*, không phải *sort hết*. Muốn bỏ luôn chi phí đọc, cần index bao trùm cả lọc lẫn sắp xếp.

### One index for both filtering and sorting

```sql
-- cả hai (MySQL từ 8.0 hỗ trợ DESC thật trong index)
CREATE INDEX orders_status_amount_idx ON orders(status, amount DESC, id);
```
```sql
-- PostgreSQL
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE status='paid' ORDER BY amount DESC, id LIMIT 5;
-- Index Scan using orders_status_amount_idx                       (cùng chiều index)
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE status='paid' ORDER BY amount ASC, id DESC LIMIT 5;
-- Index Scan Backward using orders_status_amount_idx              (ngược toàn bộ: được)
EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE status='paid' ORDER BY amount ASC, id ASC LIMIT 5;
-- Incremental Sort (Presorted Key: amount) + Index Scan Backward  (hỗn hợp chiều: sort từng phần)
```

Quy tắc: có thể đọc xuôi hoặc ngược nhưng **không đổi chiều giữa các cột** giữa chừng. Thứ tự hỗn hợp cần index khai báo đúng chiều từng cột.

## 4.2 GROUP BY and DISTINCT

Có hai chiến lược: *hash aggregate* (gom bằng hash table, không cần thứ tự) và *group aggregate* (cần dữ liệu đã sắp theo group key, index giúp được).

Hiệu quả nhất: index có các cột `GROUP BY` ở đầu. Với MySQL còn có **Loose Index Scan** cho `MIN`/`MAX`/`DISTINCT` trên prefix index:

```sql
-- MySQL
EXPLAIN FORMAT=TRADITIONAL SELECT status, MIN(created_at) FROM orders GROUP BY status;
-- Extra: Using index for group-by         (5 lần nhảy thay vì quét ~500.000 mục)
EXPLAIN FORMAT=TRADITIONAL SELECT DISTINCT status FROM orders;
-- Extra: Using index for group-by
```

### GROUP BY on the primary key and functional dependency

Nếu `GROUP BY` chứa primary key, các cột còn lại của bảng đó có **functional dependency** (phụ thuộc hàm) vào key nên được phép xuất hiện ở `SELECT` mà không cần `GROUP BY`. Cả PostgreSQL lẫn MySQL (chế độ `ONLY_FULL_GROUP_BY` mặc định) đều chấp nhận:

```sql
-- cả hai
SELECT u.id, u.name, COUNT(*)
FROM users u JOIN orders o ON o.user_id = u.id
GROUP BY u.id;                       -- OK vì u.id là PK của users
```
```sql
-- cả hai: lỗi, country không phải key
SELECT u.country, u.name, COUNT(*) FROM users u GROUP BY u.country;
-- PostgreSQL: ERROR: column "u.name" must appear in the GROUP BY clause or be used in an aggregate function
-- MySQL: ERROR 1055 ... not functionally dependent on columns in GROUP BY clause
```

Điều này chỉ đúng với cột của bảng có PK nằm trong `GROUP BY`; không áp dụng cho bảng khác trong join.

### JOIN ... USING

`USING (x)` đòi hỏi **cả hai bảng đều có cột tên `x`**; cột đó xuất hiện một lần trong kết quả. Nếu thiếu ở một bên, báo lỗi:

```sql
-- PostgreSQL
SELECT count(*) FROM users u JOIN orders o USING (user_id);
-- ERROR: column "user_id" specified in USING clause does not exist in left table
```

(`USING (id)` giữa `users` và `orders` chạy được vì cả hai đều có `id`, nhưng sai về ngữ nghĩa: `orders.id` không phải key của user. Lỗi đặt tên thế này là lý do nên đặt foreign key tên khác primary key.)

### DISTINCT ON (PostgreSQL only) and NULL

`DISTINCT ON (country)` giữ một dòng cho mỗi `country`, dòng nào do `ORDER BY` quyết định. Khi `ORDER BY ... DESC`, PostgreSQL xếp NULL **đứng đầu**, nên dòng được giữ có thể là NULL:

```sql
-- PostgreSQL
SELECT DISTINCT ON (country) country, name FROM users WHERE id <= 30
ORDER BY country, name DESC;
--  VN | (NULL)        <- NULL thắng vì DESC xếp NULL đầu

SELECT DISTINCT ON (country) country, name FROM users WHERE id <= 30
ORDER BY country, name DESC NULLS LAST;
--  VN | Name 5        <- đúng ý "tên lớn nhất, bỏ qua NULL"
```

Bản MySQL tương đương dùng window function:

```sql
-- MySQL
SELECT country, name FROM (
  SELECT country, name,
         ROW_NUMBER() OVER (PARTITION BY country ORDER BY name IS NULL, name DESC) rn
  FROM users WHERE id <= 30) x
WHERE rn = 1;
```
(Cú pháp này dùng window function chuẩn, cũng chạy được trên PostgreSQL với `ORDER BY name DESC NULLS LAST`.)

## 4.3 JOIN

Hầu hết join nhanh nhờ **nested loop có index ở phía trong**: với mỗi dòng của bảng ngoài, tra index của bảng trong. Vì vậy cột foreign key và cột join cần có index.

```sql
-- PostgreSQL
CREATE INDEX orders_user_idx ON orders(user_id);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT * FROM users u JOIN orders o ON o.user_id = u.id
WHERE u.email = 'user777@example.com';
-- Nested Loop
--   -> Index Scan using users_email_idx on users u (actual rows=1)
--   -> Index Scan using orders_user_idx on orders o (actual rows=2)       ~0.08 ms tổng
```

**Khác biệt quan trọng về foreign key:**

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Khai báo `FOREIGN KEY` | **không** tự tạo index trên cột foreign key | **tự tạo** index nếu chưa có |
| Hệ quả | phải tự `CREATE INDEX` trên cột FK (nếu không, `DELETE` ở bảng cha và join đều chậm) | có sẵn nhưng nên thiết kế multicolumn index hợp lý |

Đã kiểm: bảng `child(pid REFERENCES parent)` trên PostgreSQL chỉ có `child_pkey`; trên MySQL có thêm index `pid`.

Thuật toán join khác (hash join, merge join) xuất hiện khi hai phía đều lớn; khi đó index quan trọng ít hơn, memory và statistics quan trọng hơn. Lọc và sắp xếp **sau** join (cột từ hai bảng khác nhau) thì không index đơn nào giúp trọn vẹn; xem kỹ thuật chuyển cột/denormalize ở chương 7 và 11.

## 4.4 Subqueries and NOT EXISTS

Subquery không mặc định chậm: optimizer hiện đại thường *flatten* (gỡ phẳng) `IN`/`EXISTS` thành semi-join và `NOT EXISTS` thành anti-join.

```sql
-- PostgreSQL
EXPLAIN (COSTS OFF)
SELECT * FROM users u WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);
-- Parallel Hash Anti Join (u.id = o.user_id)
```

Dùng `NOT EXISTS` thay vì `NOT IN` khi cột con có thể NULL (ngữ nghĩa NULL ở chương 3). PostgreSQL 19 (đang ở giai đoạn release candidate vào 11/2026, chưa phát hành chính thức) bổ sung thêm một số chuyển đổi `NOT IN` sang anti join khi chứng minh được không có NULL; đừng dựa vào điều đó cho hệ thống đang chạy PG 18 trở xuống.

CTE: từ PostgreSQL 12, CTE không có tác dụng optimization fence trừ khi bạn yêu cầu. Thử nghiệm: với `WITH c AS NOT MATERIALIZED (...) SELECT * FROM c WHERE id = 5`, điều kiện `id = 5` được đẩy xuống và dùng `orders_pkey`. Với `AS MATERIALIZED`, CTE được tính trọn rồi mới lọc (`CTE Scan on c`). Chọn cái nào là có chủ đích.

## 4.5 UPDATE and DELETE need indexes too

`UPDATE ... WHERE` và `DELETE ... WHERE` tìm dòng giống `SELECT`, nên cùng quy tắc: điều kiện không có index thì full table scan và giữ lock lâu. Thêm vào đó, mỗi index là chi phí ghi (chương 9).

UPDATE theo bảng khác, hai cú pháp khác nhau:

```sql
-- PostgreSQL
UPDATE orders o SET status = 'done'
FROM users u
WHERE u.id = o.user_id AND u.status = 'banned' AND o.status = 'new';
```
```sql
-- MySQL
UPDATE orders o JOIN users u ON u.id = o.user_id
SET o.status = 'done'
WHERE u.status = 'banned' AND o.status = 'new';
```

`DELETE` của bảng cha cần index trên cột foreign key bảng con (nhất là PostgreSQL) để kiểm tra constraint nhanh.

## 4.6 Common pitfalls

- Tưởng `ORDER BY ... LIMIT` không index là sort toàn bảng; thực tế là top-N heapsort sau khi đọc hết dòng khớp.
- Quên index trên cột foreign key ở PostgreSQL.
- `DISTINCT ON ... DESC` mà không có `NULLS LAST`.
- Đặt tên cột primary key trùng tên cột ở bảng khác rồi dùng `USING` nhầm.
- Trộn cú pháp: `DISTINCT ON`, `UPDATE ... FROM` là PostgreSQL; `UPDATE ... JOIN`, `IF()` là MySQL.

## 4.7 Summary

- Index đúng thứ tự cho phép bỏ bước sort; không có index thì top-N heapsort chỉ giữ N dòng.
- Multicolumn index cho `WHERE` + `ORDER BY` cần đúng chiều từng cột.
- `GROUP BY` theo PK cho phép chọn thêm cột của bảng đó; MySQL có Loose Index Scan cho `MIN`/`MAX`/`DISTINCT`.
- Join cần index ở phía trong; PostgreSQL không tự index foreign key, MySQL thì có.
- `DISTINCT ON` (PG) cần `NULLS LAST` nếu muốn bỏ qua NULL khi `DESC`.

## 4.8 Self-check

1. `ORDER BY amount DESC LIMIT 10` không index: database sort bao nhiêu dòng trong memory?
2. Vì sao `GROUP BY u.id` cho phép `SELECT u.name` mà `GROUP BY u.country` thì không?
3. PostgreSQL có tự tạo index khi khai báo `FOREIGN KEY` không? MySQL thì sao?
4. Viết lại `DISTINCT ON (country) ... ORDER BY country, name DESC` để bỏ qua NULL.
5. `NOT IN (subquery)` khác `NOT EXISTS` ở điểm nguy hiểm nào?

<details><summary>Answer</summary>

1. Chỉ giữ 10 dòng (top-N heapsort), dù vẫn phải đọc mọi dòng khớp điều kiện.
2. `u.id` là primary key nên mọi cột của `users` có functional dependency vào nó; `country` không phải key.
3. PostgreSQL: không. MySQL InnoDB: có, tự tạo nếu chưa có index phù hợp.
4. `ORDER BY country, name DESC NULLS LAST`.
5. Nếu danh sách con chứa NULL, `NOT IN` không trả dòng nào; `NOT EXISTS` không bị.
</details>
