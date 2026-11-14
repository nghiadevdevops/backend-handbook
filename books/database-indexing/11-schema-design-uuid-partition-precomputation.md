# Chapter 11. Schema Design: Primary Keys, UUIDs, Partitioning, Pre-Sorting and Precomputation

Index tốt nhất là index bạn không cần: schema tốt giảm số query khó. Chương này gom các quyết định thiết kế ảnh hưởng mạnh nhất đến index.

## 11.1 Primary key: auto-increment, UUIDv4 or UUIDv7

| Lựa chọn | Ưu | Nhược |
|---|---|---|
| `bigint` identity / `AUTO_INCREMENT` | nhỏ (8 byte), chèn tuần tự, nhanh | lộ số lượng, khó sinh phân tán |
| UUIDv4 (ngẫu nhiên) | sinh ở client, không đoán được, không đụng độ | **chèn ngẫu nhiên vào B-tree**, index phình và fragmentation |
| UUIDv7 (prefix thời gian + ngẫu nhiên) | sinh phân tán, **gần tuần tự theo thời gian** nên thân thiện B-tree | lộ thời điểm tạo; prefix thời gian dự đoán được một phần |

**UUIDv4 gây fragmentation cho *mọi* B-tree index trên cột đó**, kể cả index primary key của PostgreSQL (heap thì không, vì dòng nối đuôi theo thứ tự chèn). Mỗi lần chèn rơi vào một leaf node ngẫu nhiên: leaf node đầy bị chia đôi (page split), leaf density thấp, cache kém hiệu quả.

### PostgreSQL 18.6 experiment (500,000 rows per table)

PostgreSQL 18 có sẵn function `uuidv7()` built-in (đã kiểm: `uuid_extract_version(uuidv7())` trả 7).

```sql
-- PostgreSQL 18
CREATE TABLE t_v4  (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), p text);
CREATE TABLE t_v7  (id uuid PRIMARY KEY DEFAULT uuidv7(),           p text);
CREATE TABLE t_ser (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, p text);
-- mỗi bảng: INSERT ... SELECT repeat('x',20) FROM generate_series(1,500000)

CREATE EXTENSION pgstattuple;
SELECT avg_leaf_density, leaf_fragmentation FROM pgstatindex('t_v4_pkey');
```

| Bảng | Kích thước index PK | Kích thước heap | Leaf density | Leaf fragmentation |
|---|---|---|---|---|
| `t_v4` (UUIDv4) | 19 MB | 33 MB | 72,0% | 49,6% |
| `t_v7` (UUIDv7) | 15 MB | 33 MB | 90,0% | 0% |
| `t_ser` (bigint) | 11 MB | 29 MB | 90,0% | 0% |

Đọc kết quả: heap của v4 và v7 bằng nhau (33 MB) chứng tỏ heap không bị fragmented bởi v4; index của v4 to hơn v7 khoảng 27% và leaf node thưa hơn. Đây là một lần đo trên máy thử với dữ liệu nhỏ, không phải hệ số "chậm X lần" đáng tin cho mọi tải; tôi **cố ý không đưa con số tốc độ** vì nó phụ thuộc phần cứng, kích thước bảng so với RAM và tỉ lệ ghi. Cột `correlation` trong `pg_stats` cũng khớp: v4 xấp xỉ -0,008 (ngẫu nhiên), v7 bằng 1 (tuần tự).

UUID (16 byte) vẫn lớn hơn bigint (8 byte) nên cả hai UUID đều hơn `t_ser`.

### MySQL 9.7.4 experiment (300,000 rows, `BINARY(16)` PK)

MySQL **không có UUIDv7 built-in** (đã kiểm: `UUID_V7()` báo `FUNCTION does not exist` trên 9.7.4). `UUID()` sinh UUIDv1 (có thành phần thời gian nhưng các bit thấp đứng đầu). `UUID_TO_BIN(uuid, 1)` hoán đổi các phần để giá trị tăng theo thời gian. Bảng so sánh (kích thước clustered index = `data_length`):

| Bảng | Cách chèn | Kích thước |
|---|---|---|
| `t_ai` BIGINT AUTO_INCREMENT | tuần tự | 15,5 MB |
| `t_ord` `UUID_TO_BIN(UUID(),1)` | gần tuần tự | 17,6 MB |
| `t_rand` UUID chèn theo thứ tự ngẫu nhiên (mô phỏng v4) | ngẫu nhiên | 28,6 MB |

Ở InnoDB còn tệ hơn PostgreSQL vì primary key **là** bảng và nằm trong mọi secondary index: chèn ngẫu nhiên làm phình toàn bộ dữ liệu (chênh khoảng 1,8 lần ở đây). Lưu UUID dưới dạng `BINARY(16)` chứ không phải `CHAR(36)`. Nếu cần UUIDv7 trên MySQL thì sinh ở application layer.

Khuyến nghị: nếu cần id sinh phân tán, ưu tiên UUIDv7 (PostgreSQL 18: `uuidv7()`; MySQL: sinh ở ứng dụng); nếu không, `bigint` identity là đơn giản nhất.

## 11.2 JSON columns: when to use them

JSON hợp cho thuộc tính thưa, thay đổi, ít khi dùng trong `WHERE`. Quy tắc: nếu một key JSON xuất hiện thường xuyên trong lọc/sắp xếp/join, nó nên là **cột thật** (có type, có constraint, có index B-tree rẻ). Chi tiết index JSON ở chương 8.

## 11.3 Constraints: the last line of defense

Constraint ở DB layer là thứ duy nhất chặn được dữ liệu sai từ mọi nguồn ghi:

- `NOT NULL`, `UNIQUE`, `FOREIGN KEY` (nhớ index cột foreign key trên PostgreSQL).
- `CHECK`: cả hai DB đều thực thi (MySQL từ 8.0.16):

```sql
-- PostgreSQL
CREATE TABLE chk (id int PRIMARY KEY, price numeric(10,2) CONSTRAINT price_pos CHECK (price >= 0));
INSERT INTO chk VALUES (1, -5);
-- ERROR: new row for relation "chk" violates check constraint "price_pos"
```
```sql
-- MySQL 9.7.4
CREATE TABLE chk (id INT PRIMARY KEY, price DECIMAL(10,2), CONSTRAINT price_pos CHECK (price >= 0));
INSERT INTO chk VALUES (1, -5);
-- ERROR 3819: Check constraint 'price_pos' is violated.
```
- Chống chồng chéo: `EXCLUDE` của PostgreSQL (chương 8, cần `btree_gist` khi kết hợp `=` trên kiểu thường).

Các "điều kiện ma" ở chương 7 nên đi kèm `CHECK` để dữ liệu không phá vỡ giả định.

## 11.4 Materialized path for trees

Lưu mỗi node kèm path từ root, ví dụ `'/1/7/123/'`. Lấy cả nhánh con = `LIKE '/1/7/%'`, một range prefix trên B-tree.

```sql
-- PostgreSQL: cần so khớp prefix nên dùng collation "C" hoặc text_pattern_ops
CREATE TABLE cat (id int PRIMARY KEY, path text COLLATE "C" NOT NULL);
CREATE INDEX cat_path ON cat (path text_pattern_ops);
EXPLAIN (COSTS OFF) SELECT * FROM cat WHERE path LIKE '/1/7/%';
-- Bitmap Index Scan on cat_path  (Index Cond: path ~>=~ '/1/7/' AND path ~<~ '/1/70')
```
```sql
-- MySQL: cột ASCII nhị phân để so khớp theo byte và tránh vấn đề collation
CREATE TABLE cat (id INT PRIMARY KEY,
  path VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, INDEX cat_path (path));
EXPLAIN FORMAT=TRADITIONAL SELECT * FROM cat WHERE path LIKE '/1/7/%';
-- type: range, key: cat_path
```
Đánh đổi: di chuyển một nhánh sang cha khác phải cập nhật `path` của mọi descendant. Phù hợp tree ít đổi (danh mục, cấu trúc tổ chức). Phương án khác: bảng đóng (closure table) hoặc `WITH RECURSIVE`.

## 11.5 Partitioning: deleting large data in an instant

Partition chia bảng lớn thành các bảng con theo khoảng thời gian (thường). Lợi ích chính là **vận hành**: bỏ cả partition cũ chỉ là metadata operation, không phải `DELETE` hàng triệu dòng. Lợi ích query: *partition pruning* chỉ quét partition liên quan.

```sql
-- PostgreSQL: partition key phải nằm trong PRIMARY KEY/UNIQUE
CREATE TABLE logs (
  id bigint GENERATED ALWAYS AS IDENTITY, ts timestamptz NOT NULL, msg text,
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);
CREATE TABLE logs_2026_01 PARTITION OF logs FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE logs_2026_02 PARTITION OF logs FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

EXPLAIN (COSTS OFF) SELECT * FROM logs WHERE ts >= '2026-02-05' AND ts < '2026-02-06';
-- Seq Scan on logs_2026_02 logs        <- chỉ một partition được chạm

ALTER TABLE logs DETACH PARTITION logs_2026_01;   -- tách khỏi bảng cha (nhanh)
DROP TABLE logs_2026_01;                            -- rồi xóa
```
Trên PostgreSQL xóa partition bằng `DETACH PARTITION` hoặc `DROP TABLE` (trên partition), **không có** `ALTER TABLE ... DROP PARTITION` (đã thử: `ERROR: column "partition" of relation ... does not exist`). Một `PRIMARY KEY (id)` không chứa `ts` bị từ chối: `unique constraint on partitioned table must include all partitioning columns`.

```sql
-- MySQL: cú pháp riêng
CREATE TABLE logs (
  id BIGINT AUTO_INCREMENT, ts DATETIME NOT NULL, msg VARCHAR(20),
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE COLUMNS(ts) (
  PARTITION p202601 VALUES LESS THAN ('2026-02-01'),
  PARTITION p202602 VALUES LESS THAN ('2026-03-01'));

ALTER TABLE logs DROP PARTITION p202601;     -- cú pháp MySQL-only
EXPLAIN FORMAT=TRADITIONAL SELECT * FROM logs WHERE ts >= '2026-02-05' AND ts < '2026-02-06';
-- partitions: p202602                         <- pruning (cột partitions ở dạng TRADITIONAL)
```
Giới hạn của MySQL (đã kiểm trên 9.7.4):
- **Partition key phải nằm trong mọi unique key, kể cả PRIMARY KEY**: `PRIMARY KEY (id)` với partition theo `ts` báo `ERROR 1503: A PRIMARY KEY must include all columns in the table's partitioning function`.
- **Bảng InnoDB có partition không hỗ trợ foreign key**: `ERROR 1506: Foreign keys are not yet supported in conjunction with partitioning`.

Cả hai hệ đều đòi partition key trong unique key: nghĩa là bạn không thể đảm bảo `id` duy nhất toàn cục chỉ bằng constraint. Chỉ partition khi bảng đủ lớn (hàng trăm triệu dòng hoặc vận hành xóa theo kỳ); partition quá nhiều làm planner chậm.

## 11.6 Pre-sorted table (clustering) for range scans

Quét một khoảng liên tiếp rất nhanh khi các dòng kề nhau trên đĩa.

- **InnoDB**: chọn primary key theo cách bạn quét. Ví dụ `PRIMARY KEY (user_id, created_at, id)` thay vì chỉ `id` thì các đơn của cùng một user nằm liền nhau. Đây là clustered index thực sự, được duy trì mãi mãi.
- **PostgreSQL**: heap không có thứ tự. Có thể sắp lại một lần bằng `CLUSTER`:

```sql
-- PostgreSQL
SELECT correlation FROM pg_stats WHERE tablename = 'cl' AND attname = 'v';   -- 0,0018: ngẫu nhiên
CLUSTER cl USING cl_v;
ANALYZE cl;
SELECT correlation FROM pg_stats WHERE tablename = 'cl' AND attname = 'v';   -- 1: đã sắp
-- chèn thêm 50.000 dòng không theo thứ tự, ANALYZE
SELECT correlation FROM pg_stats WHERE tablename = 'cl' AND attname = 'v';   -- 0,255: thứ tự đã rã
```
`CLUSTER` **chỉ sắp xếp một lần**: dòng mới không được xếp theo thứ tự, correlation giảm dần (đã đo: 1 xuống 0,255 sau khi chèn thêm). Trong lúc chạy nó giữ lock `ACCESS EXCLUSIVE`, chặn cả đọc lẫn ghi, và viết lại toàn bộ bảng kèm index. Dùng cho bảng ít thay đổi sau khi nạp (dữ liệu lịch sử), chạy trong maintenance window. Nếu cần đảm bảo thứ tự thường xuyên, hãy xét partition theo thời gian, hoặc chuyển sang multicolumn index kèm covering để không cần đọc heap.

## 11.7 Precomputation when even an index isn't fast enough

Với báo cáo tổng hợp trên hàng chục triệu dòng, không index nào giúp `GROUP BY` toàn bảng. Hãy tính trước:

```sql
-- PostgreSQL: materialized view; REFRESH ... CONCURRENTLY cần unique index
CREATE MATERIALIZED VIEW daily_sales AS
  SELECT created_day, status, count(*) AS n, sum(amount) AS total FROM orders GROUP BY 1, 2;
CREATE UNIQUE INDEX daily_sales_pk ON daily_sales (created_day, status);
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales;      -- đọc vẫn chạy trong lúc làm mới
```
```sql
-- MySQL: không có materialized view; dùng bảng tổng hợp tự duy trì (job định kỳ hoặc ghi cộng dồn)
CREATE TABLE daily_sales AS
  SELECT DATE(created_at) AS d, status, COUNT(*) AS n, SUM(amount) AS total FROM orders GROUP BY 1, 2;
ALTER TABLE daily_sales ADD PRIMARY KEY (d, status);
```
Đánh đổi là dữ liệu có latency (độ trễ). Với yêu cầu gần thời gian thực, cập nhật cộng dồn trong cùng transaction (nhớ tránh counter nóng, chương 10).

## 11.8 Common pitfalls

- UUIDv4 làm primary key InnoDB (phình toàn bảng) hoặc lưu `CHAR(36)`.
- Khẳng định "chậm X lần" cho UUIDv4 mà không có phép đo trên phần cứng của mình.
- Tưởng `CLUSTER` là clustered index của InnoDB.
- Partition với PK không chứa partition key; hoặc partition rồi muốn dùng foreign key trên MySQL.
- Dùng `DROP PARTITION` (MySQL-only) trên PostgreSQL.
- Materialized view không có lịch refresh.

## 11.9 Summary

- `bigint` là mặc định đơn giản; cần phân tán thì UUIDv7 (PG18 có `uuidv7()`); UUIDv4 phá B-tree index (cả PK PostgreSQL), nặng nhất với InnoDB.
- Key JSON thường lọc nên là cột thật; JSON cho phần thưa.
- Constraint (`CHECK`, FK, unique, exclude) là hàng rào cuối.
- Partition là công cụ vận hành: PG dùng `DETACH PARTITION`/`DROP TABLE`; MySQL `DROP PARTITION`, partition key phải nằm trong mọi unique key, và không có FK.
- `CLUSTER` chỉ sắp một lần và lock ACCESS EXCLUSIVE; InnoDB luôn cluster theo PK; tính trước bằng materialized view / bảng tổng hợp.

## 11.10 Self-check

1. Vì sao UUIDv4 làm phình index primary key ngay cả trên PostgreSQL, và heap có bị không?
2. PostgreSQL 18 có `uuidv7()` built-in không? MySQL 9.7 có `UUID_V7()` không?
3. Hai giới hạn của partition trong MySQL InnoDB là gì?
4. Cách đúng để bỏ một partition cũ trên PostgreSQL?
5. Vì sao `CLUSTER` không thay thế được clustered index của InnoDB?

<details><summary>Answer</summary>

1. Chèn ngẫu nhiên vào B-tree gây page split, leaf density thấp, fragmentation; heap thì không vì dòng nối đuôi theo thứ tự chèn (thí nghiệm: heap v4 = v7 = 33 MB).
2. PostgreSQL 18: có. MySQL 9.7.4 (thử nghiệm): không có; sinh ở ứng dụng.
3. Partition key phải nằm trong mọi unique key kể cả PK; bảng InnoDB có partition không hỗ trợ foreign key.
4. `ALTER TABLE ... DETACH PARTITION ...;` rồi `DROP TABLE ...;` (hoặc `DROP TABLE` trực tiếp partition).
5. `CLUSTER` sắp xếp một lần, lock ACCESS EXCLUSIVE, dòng mới không giữ thứ tự (correlation tụt từ 1 xuống 0,255 trong thử nghiệm); InnoDB luôn duy trì thứ tự theo PK.
</details>
