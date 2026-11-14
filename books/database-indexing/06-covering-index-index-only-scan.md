# Chapter 6. Covering Indexes and Index-Only Scans: Queries That Never Touch the Table

## 6.1 The idea

Thông thường, tra index xong còn phải nhảy sang bảng để lấy các cột khác. Nếu **mọi cột query cần** (trong `SELECT`, `WHERE`, `ORDER BY`) đều nằm sẵn trong index, database có thể trả lời chỉ bằng index. Index khi đó gọi là **covering index** (index bao phủ query).

Nhưng PostgreSQL và MySQL InnoDB thực hiện ý tưởng này khác nhau đáng kể, và đây là chỗ nhiều tài liệu nói sai.

## 6.2 PostgreSQL: Index-Only Scan depends on the visibility map

Index của PostgreSQL **không chứa thông tin MVCC** (dòng này có nhìn thấy được với transaction hiện tại hay không). Muốn biết, thường phải đọc heap. Để tránh, PostgreSQL giữ **visibility map**: mỗi page heap có một bit "all-visible" (mọi dòng trong page đều nhìn thấy được với mọi transaction). `VACUUM` là thứ bật bit này. Plan `Index Only Scan` chỉ đọc heap cho các page **chưa** all-visible, và `Heap Fetches` cho biết số lần phải đọc.

```sql
-- PostgreSQL: INCLUDE thêm cột "chở theo" vào leaf node, không dùng để tìm kiếm
CREATE INDEX orders_user_cover_idx ON orders(user_id) INCLUDE (amount);

EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT user_id, amount FROM orders WHERE user_id = 1234;
```
```
-- PostgreSQL 18.6, sau VACUUM (rút gọn)
Index Only Scan using orders_user_cover_idx on orders (actual rows=2.00)
  Index Cond: (user_id = 1234)
  Heap Fetches: 0
```

Bây giờ sửa các dòng đó rồi chạy lại:

```sql
-- PostgreSQL
UPDATE orders SET note = 'x' WHERE user_id = 1234;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT user_id, amount FROM orders WHERE user_id = 1234;
```
```
Index Only Scan using orders_user_cover_idx on orders (actual rows=2.00)
  Heap Fetches: 4          <- vẫn là "Index Only Scan" nhưng đã phải đọc heap
```

Cùng là `Index Only Scan` nhưng `Heap Fetches: 4` nghĩa là các page vừa bị sửa không còn all-visible, nên PostgreSQL phải kiểm tra heap. Bảng bị ghi liên tục mà autovacuum không theo kịp thì index-only scan chỉ còn là tên gọi. Cách đánh giá: luôn đọc `Heap Fetches`, và đảm bảo autovacuum đủ mạnh cho bảng nóng (có thể chỉnh `autovacuum_vacuum_scale_factor` theo từng bảng). Ghi chú về PostgreSQL 19 (đang ở giai đoạn release candidate vào 11/2026): bản ghi chú phát hành nói table scan thường cũng có thể đánh dấu page all-visible, trước đây chỉ `VACUUM` và `COPY ... FREEZE` làm được; đây là thông tin chưa chốt, chưa chạy thử.

`INCLUDE` (từ PostgreSQL 11):
- Cột `INCLUDE` không nằm trong sort key, không giúp `WHERE`/`ORDER BY` theo cột đó, nhưng giúp index-only scan và không bị giới hạn kiểu so sánh.
- Có thể dùng cùng `UNIQUE`: `CREATE UNIQUE INDEX users_email_incl ON users(email) INCLUDE (name);` chỉ áp constraint unique trên `email`.

## 6.3 MySQL InnoDB: covering indexes work differently

Secondary index của InnoDB luôn chứa **giá trị primary key** (chương 1), nên một query chỉ cần cột trong index cộng với PK luôn được "covered". InnoDB cũng có MVCC nhưng dùng cơ chế khác (undo log và thông tin transaction ghi ở mức page của secondary index), **không có visibility map** và không có VACUUM kiểu PostgreSQL (purge thread chạy nền). Với page secondary index vừa bị sửa gần đây, InnoDB có thể vẫn phải ghé B-tree của primary key để kiểm tra visibility; đây là chi tiết triển khai tôi không đo trong sách này.

```sql
-- MySQL: không có INCLUDE; đặt thêm cột vào cuối key
CREATE INDEX orders_user_cover_idx ON orders(user_id, amount);
EXPLAIN SELECT user_id, amount FROM orders WHERE user_id = 1234;
-- -> Covering index lookup on orders using orders_user_cover_idx (user_id = 1234)
```

Với MySQL, cột thêm vào cuối **là một phần của key** (có kích thước, có thể được dùng để sắp xếp tiếp), khác với `INCLUDE` của PostgreSQL. `EXPLAIN FORMAT=TRADITIONAL` hiển thị `Using index` trong `Extra`.

## 6.4 When a covering index is worth creating

- Query rất nóng, chỉ cần vài cột, và đọc nhiều dòng (ví dụ danh sách trang, aggregate đếm).
- Không đáng nếu thêm cột lớn (chuỗi dài) vì index phình, mọi lần ghi đắt hơn.
- Không đáng cho `SELECT *`.

So sánh trên bảng thử: query khoảng `user_id BETWEEN 1 AND 20000` (33.335 dòng) chạy `Index Only Scan` với `Heap Fetches: 22` trong ~5 ms sau khi bảng được VACUUM; chỉ 22 trong 33.335 mục phải đọc heap.

## 6.5 Common pitfalls

- Tưởng "Index Only Scan" nghĩa là không bao giờ đọc heap trên PostgreSQL: sai, phụ thuộc visibility map; xem `Heap Fetches`.
- Tưởng `INCLUDE` giúp lọc/sắp xếp theo cột được include: không.
- Thêm cột lớn vào covering index khiến index phình và có thể vượt giới hạn kích thước (chương 7).
- Nghĩ MySQL cần VACUUM để covering index hoạt động: không (nhưng cũng đừng nghĩ nó miễn phí tuyệt đối).

## 6.6 Summary

- Covering index trả lời query chỉ từ index, bỏ công đọc bảng.
- PostgreSQL: `Index Only Scan` vẫn đọc heap với page chưa all-visible; phụ thuộc `VACUUM` và `Heap Fetches`.
- PostgreSQL có `INCLUDE`; MySQL thêm cột vào cuối key.
- InnoDB: secondary index chứa sẵn PK nên query theo PK + cột index luôn được covered, không cần VACUUM.
- Chỉ cover các query nóng và cột nhỏ.

## 6.7 Self-check

1. Visibility map để làm gì và ai cập nhật nó?
2. `Index Only Scan ... Heap Fetches: 4` nghĩa là gì?
3. Khác biệt giữa cột `INCLUDE` của PostgreSQL và cột thêm cuối key của MySQL?
4. Vì sao covering index của InnoDB không cần VACUUM để hoạt động?
5. Khi nào không nên tạo covering index?

<details><summary>Answer</summary>

1. Đánh dấu page heap mà mọi dòng đều hiển thị với mọi transaction, cho phép bỏ qua đọc heap; `VACUUM` (và autovacuum) cập nhật.
2. Dù là index-only scan, 4 lần phải đọc heap vì page chưa all-visible (ví dụ vừa UPDATE).
3. `INCLUDE`: cột không nằm trong sort key. MySQL: cột nằm trong key, có thể dùng thêm cho sắp xếp/so sánh.
4. InnoDB kiểm tra visibility bằng undo log và thông tin transaction (không có visibility map); secondary index chứa sẵn PK.
5. Khi cột nặng làm index phình, khi query ít chạy, hoặc `SELECT *`.
</details>
