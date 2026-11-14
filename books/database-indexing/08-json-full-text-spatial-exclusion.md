# Chương 8. Index cho JSON, full-text search, spatial data và exclusion constraint

B-tree không phải loại index duy nhất. Chương này giới thiệu các loại index chuyên biệt. Hầu hết là của PostgreSQL; MySQL có cách riêng cho JSON và spatial data.

| Loại index | DB | Dùng cho |
|---|---|---|
| B-tree | cả hai | `=`, range, sắp xếp, prefix |
| GIN | PostgreSQL | element trong cấu trúc: `jsonb`, array, full-text, trigram |
| GiST | PostgreSQL | geometry, range type, nearest-neighbor (KNN), exclusion constraint |
| Hash | PostgreSQL | chỉ `=` |
| Multi-valued index | MySQL 8.0.17+ | array giá trị trong cột JSON |
| SPATIAL (R-tree) | MySQL | geometry data |

## 8.1 JSON

### PostgreSQL: GIN chỉ dành cho `jsonb`

`jsonb` (dạng nhị phân đã phân tích) hỗ trợ GIN với các operator chứa: `@>` (contains), `?` (có key), `?|`, `?&`. Kiểu `json` (lưu nguyên văn bản) **không** có operator class GIN mặc định:

```sql
-- PostgreSQL
CREATE TABLE ev (id serial PRIMARY KEY, payload jsonb, pj json);
CREATE INDEX ev_gin ON ev USING gin (payload);            -- OK
CREATE INDEX ev_gin_pj ON ev USING gin (pj);
-- ERROR: data type json has no default operator class for access method "gin"
```

Query "chứa":

```sql
-- PostgreSQL (200.000 dòng)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT count(*) FROM ev WHERE payload @> '{"tags":["t5"],"type":"buy"}';
-- Bitmap Heap Scan -> Bitmap Index Scan on ev_gin (actual rows=667)   Execution Time: ~4.5 ms
```
Lưu ý: operator `?` cũng dùng được GIN, nhưng planner chọn Seq Scan trong thử nghiệm vì **mọi dòng đều có key `type`** (chọn lọc 100%). Đừng đọc đó là "GIN không hỗ trợ `?`".

Biến thể `jsonb_path_ops` nhỏ hơn và nhanh hơn cho `@>`, nhưng không hỗ trợ `?`:
```sql
CREATE INDEX ev_gin_path ON ev USING gin (payload jsonb_path_ops);   -- PostgreSQL
```

**Operator trích xuất `->>` không dùng được GIN.** Với `WHERE payload->>'type' = 'buy'` cần B-tree trên expression:

```sql
-- PostgreSQL
EXPLAIN (COSTS OFF) SELECT count(*) FROM ev WHERE payload->>'type' = 'buy';   -- Seq Scan
CREATE INDEX ev_user_idx ON ev (((payload->>'user')::int));
EXPLAIN (COSTS OFF) SELECT * FROM ev WHERE (payload->>'user')::int = 42;      -- Bitmap Index Scan on ev_user_idx
EXPLAIN (COSTS OFF) SELECT * FROM ev WHERE payload->>'user' = '42';           -- Seq Scan: so sánh chuỗi, khác expression
```
(Ví dụ cuối là bẫy: expression trong query phải trùng expression trong index kể cả phép cast.)

### MySQL: không index trực tiếp cột JSON

MySQL **không** cho tạo index trên bản thân cột `JSON`. Có ba đường:

1. **Generated column + index** (cho giá trị đơn):
```sql
-- MySQL
ALTER TABLE ev ADD COLUMN type_g VARCHAR(10) GENERATED ALWAYS AS (payload->>'$.type') VIRTUAL,
               ADD INDEX ev_type_g (type_g);
EXPLAIN SELECT COUNT(*) FROM ev WHERE type_g = 'buy';
-- -> Covering index lookup on ev using ev_type_g (type_g = 'buy')
EXPLAIN SELECT COUNT(*) FROM ev WHERE payload->>'$.type' = 'buy';
-- -> Index lookup on ev using ev_type_g     (expression trùng nên optimizer vẫn dùng)
```
2. **Functional index** (8.0.13+): `CREATE INDEX ev_user_fn ON ev (((CAST(payload->>'$.user' AS UNSIGNED))));` rồi query đúng expression `CAST(payload->>'$.user' AS UNSIGNED) = 42` (đã kiểm: `Index lookup ... ev_user_fn`).
3. **Multi-valued index** (8.0.17+) cho mảng trong JSON, dùng `CAST(... AS type ARRAY)`:
```sql
-- MySQL
ALTER TABLE ev ADD INDEX ev_tags ((CAST(payload->'$.tags' AS CHAR(10) ARRAY)));
EXPLAIN SELECT COUNT(*) FROM ev WHERE 't5' MEMBER OF (payload->'$.tags');   -- dùng ev_tags
EXPLAIN SELECT COUNT(*) FROM ev WHERE JSON_CONTAINS(payload->'$.tags', '"t5"');   -- dùng ev_tags (range)
EXPLAIN SELECT COUNT(*) FROM ev WHERE JSON_OVERLAPS(payload->'$.tags', '["t5","u3"]');   -- dùng ev_tags
```
Multi-valued index **không chỉ dành cho số nguyên không dấu**. Đã tạo thành công với `UNSIGNED ARRAY`, `CHAR(5) ARRAY`, `DECIMAL(10,2) ARRAY`, `DATE ARRAY` (cùng `SIGNED`, `DATETIME`, `TIME`, `BINARY` theo tài liệu). Có thể khai báo `UNIQUE` (lỗi `Duplicate entry '[2, 3]'` khi hai dòng chung một phần tử). Ba function được hỗ trợ: `MEMBER OF()`, `JSON_CONTAINS()`, `JSON_OVERLAPS()`. Mỗi bảng ghi mỗi phần tử một index entry nên chi phí ghi cao với array dài.

Lời khuyên thiết kế: JSON hợp cho thuộc tính thưa, ít query. Key thường xuyên lọc nên thành **cột thật**.

## 8.2 Substring search: trigram (PostgreSQL)

`LIKE '%abc%'` không dùng B-tree (chương 3). Giải pháp PostgreSQL là extension `pg_trgm` với GIN (hoặc GiST).

Trigram là mọi chuỗi 3 ký tự liên tiếp. Quan trọng: pg_trgm **tách văn bản thành từng từ**, mỗi từ được đệm hai khoảng trắng ở đầu và một ở cuối; nó **không** tạo trigram xuyên qua dấu cách. Kiểm chứng:

```sql
-- PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT show_trgm('hello world');
-- {"  h","  w"," he"," wo",ell,hel,"ld ",llo,"lo ",orl,rld,wor}
SELECT show_trgm('a b');
-- {"  a","  b"," a "," b "}
```
Không có trigram nào như `"o w"`. Từ ngắn vẫn có trigram nhờ phần đệm.

```sql
-- PostgreSQL
CREATE INDEX users_email_trgm ON users USING gin (email gin_trgm_ops);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT * FROM users WHERE email LIKE '%77777@exam%';
-- Bitmap Heap Scan (Recheck Cond: email ~~ '%77777@exam%')
--   -> Bitmap Index Scan on users_email_trgm (actual rows=300)    <- index trả 300 ứng viên
--   Rows Removed by Index Recheck: 297                           <- recheck loại 297, còn 3 dòng thật
-- Execution Time: ~8.8 ms
EXPLAIN (COSTS OFF) SELECT * FROM users WHERE email ILIKE '%ER77777%';   -- cũng dùng được (ILIKE)
```
Index trigram là **filter thô**, kết quả luôn được kiểm lại trên dòng thật (recheck). Mẫu quá ngắn (dưới 3 ký tự) thì không hữu ích. Index lớn và ghi chậm hơn B-tree.

MySQL: `LIKE '%x%'` không có index tương đương; dùng `FULLTEXT` index (tìm theo từ, không phải chuỗi con tùy ý) hoặc engine tìm kiếm ngoài.

## 8.3 Spatial data (PostgreSQL + PostGIS)

Kiểu `geometry` và `geography` **không có sẵn**; cần extension PostGIS. Trên PostgreSQL thuần:

```sql
-- PostgreSQL 18.6 (không cài PostGIS)
CREATE TABLE g1 (g geometry);
-- ERROR: type "geometry" does not exist
```
Phần PostGIS dưới đây chạy trên container `postgis/postgis` (PostGIS 3.7.0, trên PostgreSQL 18).

```sql
-- PostgreSQL + PostGIS
CREATE EXTENSION postgis;
CREATE TABLE shop (id serial PRIMARY KEY, name text,
                   geom geometry(Point, 4326), geog geography(Point, 4326));
CREATE INDEX shop_geom ON shop USING gist (geom);
CREATE INDEX shop_geog ON shop USING gist (geog);
```

**`geometry` với SRID 4326 vẫn tính trên mặt phẳng**: khoảng cách trả về đơn vị *độ*, không phải mét. Muốn mét trên mặt cầu/ellipsoid, dùng `geography`:

```sql
-- PostgreSQL + PostGIS
SELECT ST_Distance(ST_SetSRID(ST_MakePoint(105,20),4326), ST_SetSRID(ST_MakePoint(106,20),4326)) AS degrees_planar,
       ST_Distance(ST_SetSRID(ST_MakePoint(105,20),4326)::geography,
                   ST_SetSRID(ST_MakePoint(106,20),4326)::geography) AS meters;
--  degrees_planar = 1   |   meters = 104646.93
```
Radius query và nearest-neighbor query dùng được GiST:

```sql
-- PostgreSQL + PostGIS
EXPLAIN (COSTS OFF) SELECT name FROM shop
WHERE ST_DWithin(geog, ST_SetSRID(ST_MakePoint(105.5,20.5),4326)::geography, 1000);
-- Bitmap Index Scan on shop_geog (Index Cond: geog && _st_expand(..., 1000))
EXPLAIN (COSTS OFF) SELECT name FROM shop
ORDER BY geog <-> ST_SetSRID(ST_MakePoint(105.5,20.5),4326)::geography LIMIT 5;
-- Index Scan using shop_geog (Order By: geog <-> ...)         <- KNN dùng index
```
MySQL: spatial type nằm sẵn trong MySQL, `SPATIAL INDEX` (R-tree), xem chương 7.

## 8.4 Exclusion constraint (PostgreSQL)

Constraint `EXCLUDE` đảm bảo không hai dòng nào có cùng lúc "các operator trả về true". Ví dụ kinh điển: không đặt phòng chồng giờ.

Để so sánh bằng (`=`) trên kiểu `int` **bên trong index GiST**, cần extension `btree_gist`, vì GiST mặc định không có operator class cho `int`:

```sql
-- PostgreSQL
CREATE TABLE booking_bad (room int, during tstzrange,
  EXCLUDE USING gist (room WITH =, during WITH &&));
-- ERROR: data type integer has no default operator class for access method "gist"

CREATE EXTENSION btree_gist;
CREATE TABLE booking (room int, during tstzrange,
  EXCLUDE USING gist (room WITH =, during WITH &&));

INSERT INTO booking VALUES (1, '[2026-01-01 09:00, 2026-01-01 10:00)');   -- OK
INSERT INTO booking VALUES (1, '[2026-01-01 09:30, 2026-01-01 11:00)');   -- ERROR: conflicting key value violates exclusion constraint
INSERT INTO booking VALUES (1, '[2026-01-01 10:00, 2026-01-01 11:00)');   -- OK: đoạn [) nên 10:00 không chồng
INSERT INTO booking VALUES (2, '[2026-01-01 09:30, 2026-01-01 11:00)');   -- OK: phòng khác
```
Đây là cách duy nhất trong PostgreSQL đảm bảo "không chồng chéo" ở database layer mà không cần lock thủ công. MySQL không có tương đương; phải lock ở application layer hoặc dùng `SELECT ... FOR UPDATE`.

## 8.5 Cạm bẫy thường gặp

- Tạo GIN trên `json` thay vì `jsonb`.
- Kỳ vọng GIN giúp `payload->>'k' = 'v'`; cần B-tree trên expression, hoặc `@>`.
- Mong MySQL index trực tiếp cột JSON; phải qua generated/functional/multi-valued.
- Nghĩ `geometry(…, 4326)` trả mét; dùng `geography` hoặc projection thích hợp.
- Quên `CREATE EXTENSION btree_gist` khi kết hợp `=` trên `int` với `&&` trong `EXCLUDE`.
- Kỳ vọng trigram bắt chuỗi xuyên qua dấu cách như "một chuỗi dài"; nó tách từng từ.

## 8.6 Tóm tắt

- GIN `@>`/`?` chỉ cho `jsonb`; `->>` cần expression B-tree.
- MySQL: JSON qua generated column, functional index hoặc multi-valued index (`CAST(... AS type ARRAY)`, nhiều kiểu).
- pg_trgm tách theo từ, có đệm, không tạo trigram xuyên dấu cách; index chỉ là filter thô có recheck.
- `geometry` là mặt phẳng, `geography` là mặt cầu (mét); cả hai cần PostGIS.
- `EXCLUDE USING gist (int_col WITH =, range WITH &&)` cần `btree_gist`.

## 8.7 Tự kiểm tra

1. Vì sao `CREATE INDEX ... USING gin (pj)` lỗi khi `pj` là `json`?
2. Ba cách để có index cho một thuộc tính JSON trong MySQL?
3. `show_trgm('a b')` cho kết quả gì và nó nói lên điều gì về trigram?
4. Khác biệt giữa `geometry` SRID 4326 và `geography` khi gọi `ST_Distance`?
5. Cần gì để `EXCLUDE USING gist (room WITH =, during WITH &&)` chạy được?

<details><summary>Đáp án</summary>

1. `json` không có operator class GIN mặc định; dùng `jsonb`.
2. Generated column + index; functional index (8.0.13+); multi-valued index (8.0.17+) cho mảng.
3. `{"  a","  b"," a "," b "}`: mỗi từ được đệm riêng; không có trigram nối qua dấu cách.
4. `geometry` tính trên mặt phẳng (đơn vị độ); `geography` tính trên mặt cầu/ellipsoid (đơn vị mét).
5. `CREATE EXTENSION btree_gist;`.
</details>
