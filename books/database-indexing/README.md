# Database Indexing: bản học lại (cập nhật 11/2026)

Bản viết lại bằng lời mới, theo dàn ý chủ đề của ebook "Database Indexing & Những Điều Developer Cần Biết", để tự học. Nội dung đã được kiểm chứng bằng cách chạy thật trên PostgreSQL và MySQL trong Docker; khi kết quả thật khác điều định viết, nội dung theo kết quả thật.

## Phiên bản đã dùng và đã chạy thử

Kết quả của `SELECT version()`:

| DB | `version()` | Ghi chú |
|---|---|---|
| PostgreSQL | `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit` | image `postgres:latest`, collation database `en_US.utf8` |
| PostgreSQL + PostGIS | PostgreSQL 18.6, PostGIS 3.7.0 | image `postgis/postgis:latest`, chỉ dùng cho chương 8 (mục 8.3) |
| MySQL | `9.7.4` | image `mysql:lts`, engine InnoDB, collation `utf8mb4_0900_ai_ci` |

Tình hình phiên bản tại 07/11/2026 (tra từ postgresql.org và dev.mysql.com, không dựa trí nhớ):

- **PostgreSQL**: 18 là bản chính thức mới nhất, ra ngày 25/09/2025, bản vá hiện tại 18.6. Các bản 17.11, 16.15, 15.19 còn được hỗ trợ; 14 hết hỗ trợ ngày 12/11/2026. PostgreSQL 19 đang ở giai đoạn **release candidate** (RC 1 ngày 15/10/2026), chưa phát hành chính thức; sách chỉ nhắc 19 như thông tin chưa chốt, chưa chạy thử.
- **MySQL**: có hai nhánh, LTS và Innovation. 9.7 là bản LTS (9.7.0 ra ngày 21/04/2026, mới nhất là 9.7.4 ngày 20/10/2026); 8.4 cũng là một dòng LTS. Tài liệu MySQL nói 9.7 là bản dùng đánh số tuần tự cuối cùng; sau đó dùng đánh số theo lịch (ví dụ "26.7" là bản tháng 7/2026). Tôi **không xác định chắc** số hiệu bản Innovation mới nhất và ngày phát hành chính xác của từng bản 26.x; bản sách chỉ chạy thử 9.7.4.
- Tính năng liên quan index/optimizer đã xác minh: skip scan multicolumn B-tree (PostgreSQL 18), `uuidv7()` built-in (PostgreSQL 18), `Index Searches` trong `EXPLAIN` (PostgreSQL 18), Skip Scan range access (MySQL 8.0.13+), `EXPLAIN ANALYZE` (MySQL 8.0.18+), `EXPLAIN` mặc định dạng TREE (quan sát trên 9.7.4), hypergraph optimizer có trong bản Community từ 9.7 (bật bằng `optimizer_switch='hypergraph_optimizer=on'`, theo release notes, chưa thử), MD5()/SHA()/SHA1() không còn built-in từ MySQL 9.6 (đã thử trên 9.7.4).

## Mục lục

1. [Nền tảng: index là gì, B-tree hoạt động ra sao, bảng được lưu thế nào](01-index-fundamentals-and-storage.md)
2. [Multicolumn index: bốn nguyên tắc và chuyện skip scan](02-multicolumn-index-four-rules.md)
3. [Operator, NULL, LIKE, function bọc cột và data type](03-operators-null-like-functions-types.md)
4. [ORDER BY, GROUP BY, DISTINCT, JOIN, subquery, UPDATE/DELETE](04-order-by-group-by-distinct-join.md)
5. [Optimizer, EXPLAIN và statistics](05-optimizer-explain-statistics.md)
6. [Covering index và Index-Only Scan](06-covering-index-index-only-scan.md)
7. [Kỹ thuật index nâng cao: expression, partial index, giới hạn kích thước, unique và NULL](07-advanced-index-techniques.md)
8. [JSON, full-text search, spatial data, exclusion constraint](08-json-full-text-spatial-exclusion.md)
9. [Chi phí ghi, bảo trì index và dọn index thừa](09-write-cost-maintenance-unused-indexes.md)
10. [Kỹ thuật query: keyset pagination, upsert, row lock, counter, xóa trùng, CTE](10-query-techniques-pagination-locking-upsert-cte.md)
11. [Thiết kế schema: primary key, UUID, partition, pre-sorting, precomputation](11-schema-design-uuid-partition-precomputation.md)

## Cách đọc

- Học theo thứ tự 1 đến 6 trước: đó là phần cốt lõi (B-tree, thứ tự cột, điều kiện nào dùng được index, đọc plan). Các chương 7 đến 11 là kỹ thuật bổ sung, đọc theo nhu cầu.
- Mỗi chương: giải thích, ví dụ (schema, query, EXPLAIN rút gọn), cạm bẫy, tóm tắt, câu hỏi tự kiểm tra. **Đáp án nằm trong thẻ `<details>` ở cuối mỗi chương**: tự trả lời trước khi mở.
- Mọi khối SQL có nhãn `-- PostgreSQL`, `-- MySQL` hoặc `-- cả hai` ở dòng đầu. Cú pháp chỉ của một DB không được dùng lẫn: ví dụ `DISTINCT ON`, `UPDATE ... FROM`, `RETURNING`, `ALTER TABLE ... DETACH PARTITION` là PostgreSQL; `IF()`, `ALTER TABLE ... DROP PARTITION`, `UPDATE ... JOIN`, `INSERT IGNORE` là MySQL.
- Số liệu thời gian (ms) chỉ để so sánh tương đối trên máy thử với dữ liệu nhỏ nằm hết trong RAM, không dùng làm hệ số tuyệt đối.
- Plan được rút gọn, bỏ các dòng `Planning`, `Buffers` khi không cần.
- Dữ liệu thử: `users` 300.000 dòng, `orders` khoảng 500.000 dòng, sinh bằng `generate_series` (PostgreSQL) và recursive CTE (MySQL). Script nằm ngoài thư mục này, trong thư mục test của phiên làm việc.

## Những ví dụ chưa chạy thử hoặc chưa chắc

- Mọi thứ về PostgreSQL 19 (RC) và hypergraph optimizer của MySQL: chỉ theo ghi chú phát hành.
- Bảng so sánh functional index ở hệ khác (MariaDB, SQL Server, Oracle, SQLite): theo tài liệu, chưa chạy.
- Chi tiết triển khai InnoDB về kiểm tra visibility với covering index (chương 6): không đo.
- Nguyên nhân MySQL ước lượng sai cho `status = 'active'` dù đã có histogram (chương 5): chưa xác định.
- `EXPLAIN ANALYZE` với `UPDATE`/`DELETE` nhiều bảng trên MySQL: kết quả thử nghiệm không đủ rõ để kết luận.
- "Skip scan chỉ cho query covering" của MySQL: đúng trong ví dụ đã thử (SELECT * không dùng skip scan); điều kiện đầy đủ xem tài liệu MySQL.
- Mối liên hệ chính xác giữa `Index Searches: 11` và số giá trị status (5) ở chương 2: chỉ nói "nhiều lần tìm kiếm".
