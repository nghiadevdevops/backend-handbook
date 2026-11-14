# Chapter 2. Multicolumn Indexes: Four Rules and Skip Scan

Dữ liệu dùng trong chương: bảng `orders` khoảng 500.000 dòng, 5 giá trị `status`, `created_at` trải trong năm 2024.

```sql
-- PostgreSQL
CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  status text NOT NULL, amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL, note text);
-- MySQL: giống, đổi kiểu: BIGINT UNSIGNED AUTO_INCREMENT, VARCHAR(10), DATETIME
```

## 2.1 The four rules

Hãy hình dung index `(status, created_at)` là danh bạ sắp theo `status`, trong mỗi status sắp theo `created_at`.

1. **Nhảy thẳng tới vị trí**: để tận dụng B-tree, điều kiện phải cho database một *điểm bắt đầu* xác định trong thứ tự của index.
2. **Quét theo một hướng**: sau khi đến điểm bắt đầu, database đi xuôi (hoặc ngược) qua các leaf node liền kề, đến khi điều kiện hết đúng.
3. **Từ trái sang phải**: các cột đầu của index quyết định "thùng" nào được chọn trước. Cột sau chỉ có ích khi cột đứng trước nó được cố định bằng `=` (hoặc, với cơ chế mới, được database tự liệt kê, xem 2.3).
4. **Điều kiện range "phá vỡ" phễu**: cột đầu tiên dùng `<`, `>`, `BETWEEN` là cột cuối cùng còn thu hẹp được vùng quét liên tục; các cột sau nó chỉ còn được dùng như filter trên những mục đã quét.

### Experiment: `=` then range

```sql
-- cả hai
CREATE INDEX orders_status_created_idx ON orders(status, created_at);
```

```sql
-- PostgreSQL
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT * FROM orders
WHERE status = 'paid' AND created_at >= '2024-06-01' AND created_at < '2024-06-02';
```
```
-- PostgreSQL 18.6 (rút gọn)
Bitmap Heap Scan on orders (actual rows=288.00)
  -> Bitmap Index Scan on orders_status_created_idx (actual rows=288.00)
       Index Cond: ((status = 'paid') AND (created_at >= ...) AND (created_at < ...))
       Index Searches: 1
Execution Time: 0.219 ms
```

Cả hai điều kiện đều nằm trong `Index Cond`, một lần đi xuống B-tree (`Index Searches: 1`). Đó là hình mẫu tốt nhất.

```sql
-- MySQL
EXPLAIN SELECT * FROM orders
WHERE status = 'paid' AND created_at >= '2024-06-01' AND created_at < '2024-06-02';
```
```
-- MySQL 9.7.4 (rút gọn)
-> Index range scan on orders using orders_status_created_idx
   over (status = 'paid' AND '2024-06-01' <= created_at < '2024-06-02')
```

### Experiment: range first, `=` after

```sql
-- PostgreSQL
CREATE INDEX orders_created_status_idx ON orders(created_at, status);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT * FROM orders
WHERE created_at >= '2024-03-01' AND created_at < '2024-03-08' AND status = 'paid';
```
```
-- PostgreSQL 18.6 (rút gọn)
Index Scan using orders_created_status_idx (actual rows=2016.00)
  Index Cond: (created_at >= ... AND created_at < ... AND status = 'paid')
  Index Searches: 1
```

Lưu ý: cả ba điều kiện đều ở `Index Cond`, nhưng index này duyệt toàn bộ một tuần dữ liệu, trong đó chỉ khoảng 1/5 mục có `status = 'paid'`; cột `status` được kiểm tra khi quét chứ không giúp "nhảy". Quy tắc thực dụng: **cột dùng `=` đặt trước, cột dùng range đặt sau**. Với index `(status, created_at)` database chỉ quét đúng phần mình cần.

## 2.2 Leading column with no condition

Với index `(status, created_at)`, query chỉ lọc theo `created_at`:

```sql
-- PostgreSQL
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT * FROM orders WHERE created_at >= '2024-06-01' AND created_at < '2024-06-02';
```

Trước PostgreSQL 18, plan này thường bỏ multicolumn index (hoặc full index scan). Với PostgreSQL 18:

```
-- PostgreSQL 18.6 (rút gọn)
Bitmap Heap Scan on orders (actual rows=1440.00)
  -> Bitmap Index Scan on orders_status_created_idx (actual rows=1440.00)
       Index Cond: (created_at >= ... AND created_at < ...)
       Index Searches: 11
Execution Time: 0.555 ms
```

Đây là **skip scan**: database tự lần lượt "nhảy" qua từng giá trị khác nhau của cột đầu (`status`) và thực hiện tìm kiếm theo `created_at` trong mỗi giá trị. `Index Searches: 11` cho thấy nhiều lần đi xuống B-tree thay vì một lần. Nó hiệu quả khi cột bị bỏ qua có **ít giá trị khác nhau** (low cardinality). Nếu cột đầu có hàng trăm nghìn giá trị khác nhau, skip scan thành quét gần như toàn index và optimizer sẽ chọn cách khác.

## 2.3 Skip scan per database (correcting a common misconception)

| DB | Có không | Ghi chú |
|---|---|---|
| PostgreSQL 18+ | Có, trên multicolumn B-tree | Áp dụng khi bỏ qua điều kiện `=` ở một hay nhiều cột đứng đầu. Xác minh bằng `Index Searches` trong plan. PostgreSQL 17 trở về trước: không có. |
| MySQL 8.0.13+ | Có, gọi là *Skip Scan range access method* | Điều kiện chặt hơn: chủ yếu cho query **chỉ cần cột nằm trong index** (covering). Có thể tắt/bật bằng hint `SKIP_SCAN` / `NO_SKIP_SCAN` hoặc `optimizer_switch='skip_scan=on|off'`. |
| SQL Server | Không có skip scan native | Muốn dùng cột sau, thường phải có điều kiện trên cột đầu hoặc tạo index khác. |

**Đừng nhầm** skip scan của MySQL với *Loose Index Scan*. Loose Index Scan là kỹ thuật cho `GROUP BY`/`DISTINCT`/`MIN`/`MAX` (plan hiện `Using index for group-by`), còn Skip Scan là kỹ thuật cho điều kiện `WHERE` thiếu prefix. Cả hai cùng tồn tại trong MySQL.

Thí nghiệm MySQL, hai biến thể:

```sql
-- MySQL: chỉ cần cột của index  -> skip scan
EXPLAIN FORMAT=TREE
SELECT created_at FROM orders
WHERE created_at >= '2024-06-01' AND created_at < '2024-06-02';
```
```
-- MySQL 9.7.4 (rút gọn)
-> Covering index skip scan on orders using orders_status_created_idx
   over '2024-06-01 00:00:00' <= created_at < '2024-06-02 00:00:00'
```
```sql
-- MySQL: SELECT * (không covering)  -> không skip scan
EXPLAIN SELECT * FROM orders
WHERE created_at >= '2024-06-01' AND created_at < '2024-06-02';
```
```
-- MySQL 9.7.4 (rút gọn)
-> Table scan on orders
```

Bài học: ở MySQL, đừng trông chờ skip scan cho `SELECT *`. Cách chắc chắn vẫn là một index có `created_at` đứng đầu (hoặc dùng bảng đã có index riêng cho cột đó). Loose Index Scan thì chạy được, ví dụ:

```sql
-- MySQL
EXPLAIN FORMAT=TRADITIONAL SELECT status, MIN(created_at) FROM orders GROUP BY status;
-- Extra: Using index for group-by
```

## 2.4 Column order: how to choose

1. Cột dùng `=` trước.
2. Cột range hoặc cột cần `ORDER BY` kế tiếp.
3. Giữa các cột `=`, cột nào xuất hiện ở nhiều query hơn đặt trước (để một secondary indexc vụ được nhiều query nhờ nguyên tắc 3).
4. Selectivity (độ chọn lọc) chỉ là tiêu chí phụ. "Đặt cột nhiều giá trị khác nhau lên đầu" là lời khuyên chưa đủ: nếu query luôn lọc cả hai cột bằng `=`, thứ tự gần như không ảnh hưởng tốc độ tra cứu; nó chỉ quyết định index còn phục vụ được query nào khác.

## 2.5 Common pitfalls

- Tạo `(a)` và `(a, b)` cùng lúc: `(a)` thường thừa vì `(a, b)` đã phục vụ query theo `a`.
- Đặt cột range ở giữa index rồi mong cột đứng sau giúp thu hẹp (nguyên tắc 4).
- Tin rằng skip scan "giải quyết mọi thứ": nó chỉ đáng giá khi cột bị bỏ qua có ít giá trị khác nhau.
- Quên rằng skip scan PostgreSQL cần bản 18 trở lên, còn MySQL cần query covering.

## 2.6 Summary

- Điều kiện `=` rồi range là hình mẫu: một điểm bắt đầu, một hướng quét.
- Cột đầu tiên có range là cột cuối cùng thu hẹp được vùng quét.
- PostgreSQL 18 có skip scan trên multicolumn B-tree (xem `Index Searches`); MySQL 8.0.13+ có Skip Scan range access, chủ yếu cho query covering; SQL Server không có skip scan native.
- Skip scan khác Loose Index Scan của MySQL.
- Khi cần chắc chắn, đặt cột lọc thường xuyên lên đầu index.

## 2.7 Self-check

1. Với index `(a, b, c)` và `WHERE a = 1 AND b > 5 AND c = 3`, cột nào thu hẹp vùng quét, cột nào chỉ là filter?
2. `Index Searches: 11` trong plan PostgreSQL 18 nói lên điều gì?
3. Vì sao MySQL không dùng skip scan với `SELECT *` trong ví dụ trên?
4. Skip scan và Loose Index Scan của MySQL khác nhau thế nào?
5. Khi nào skip scan của PostgreSQL không còn hiệu quả?

<details><summary>Answer</summary>

1. `a` (`=`) và `b` (range) thu hẹp vùng quét. `c` chỉ lọc trên các mục đã quét.
2. Database đi xuống B-tree của index 11 lần (skip scan nhảy qua nhiều giá trị của cột đầu), thay vì 1 lần.
3. Skip Scan của MySQL chủ yếu áp dụng cho query covering; `SELECT *` cần cột ngoài index nên optimizer chọn cách khác (table scan trong thử nghiệm).
4. Skip Scan: xử lý `WHERE` thiếu prefix. Loose Index Scan: tăng tốc `GROUP BY`/`DISTINCT`/`MIN`/`MAX` bằng cách nhảy qua các nhóm.
5. Khi cột bị bỏ qua có rất nhiều giá trị khác nhau, số lần tìm kiếm gần bằng số mục, nên tiết kiệm không còn.
</details>
