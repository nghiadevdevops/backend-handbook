# Chapter 6. Vector Indexes: Exact Search, HNSW, IVFFlat (pgvector)

## 1. Scenario

Bảng `kb_chunks` có 5.000 dòng thì `ORDER BY embedding <=> $1 LIMIT 5` chạy vài mili-giây. Khi lên vài trăm nghìn, vài triệu dòng, mỗi query phải tính distance tới **mọi** vector, và latency tăng tuyến tính. Bạn đã biết B-tree index giúp tìm chính xác một key. Với vector không có total order để B-tree dùng, nên cần các cấu trúc khác, và chúng đánh đổi một thứ mà index thông thường không bao giờ đòi hỏi: **độ chính xác**.

## 2. Concepts

### 2.1 Exact search and ANN

- **Exact (k-NN chính xác)**: scan toàn bộ, tính distance, lấy k nhỏ nhất. Luôn đúng 100%, chi phí O(N × d). Với N nhỏ (dưới vài chục nghìn dòng) hoặc khi query đã filter còn ít dòng, đây thường là lựa chọn tốt nhất, và cũng là **ground truth** để đo các index khác.
- **ANN (Approximate Nearest Neighbor)**: index trả về k neighbor **gần đúng**, nhanh hơn nhiều, chấp nhận đôi khi bỏ sót một hai kết quả thật sự gần nhất.

Thước đo chất lượng là **recall@k**: trong k kết quả thật (từ exact), index tìm lại được bao nhiêu phần trăm.

```
recall@10 = |index results ∩ 10 true results| / 10     (average over many queries)
```

Khác biệt cốt lõi với B-tree: B-tree index trả đúng kết quả; vector index ANN trả **gần đúng**, và bạn chọn điểm đánh đổi bằng tham số.

### 2.2 IVFFlat

IVFFlat (Inverted File with flat storage) chia vector space thành `lists` cluster bằng k-means trên dữ liệu **có sẵn lúc build**. Mỗi vector được gán vào cluster có centroid gần nhất. Khi query, tìm `probes` cluster có centroid gần query nhất rồi chỉ scan vector trong các cluster đó.

```
build:  k-means → `lists` centroids; each vector goes into 1 list
query:  pick `probes` nearest centroids → scan those lists → top-k
```

Tham số (README pgvector 0.8.7, tra 07/11/2026):
- `lists` (lúc tạo index): số cluster. Gợi ý của README: `rows / 1000` cho đến 1 triệu dòng, `sqrt(rows)` khi lớn hơn.
- `ivfflat.probes` (lúc query, mặc định 1): số cluster được scan. README gợi ý khởi điểm khoảng `sqrt(lists)`. `probes = lists` tương đương scan toàn bộ (exact).
- Phải build **sau khi đã có dữ liệu đại diện**: centroid tính từ dữ liệu lúc đó. Dữ liệu thêm sau không làm centroid dịch chuyển, nên khi distribution thay đổi nhiều, recall giảm và cần REINDEX.

Ưu: build nhanh, index nhỏ. Nhược: recall phụ thuộc chất lượng cluster; để có recall cao phải tăng `probes` và latency tăng theo.

### 2.3 HNSW

HNSW (Hierarchical Navigable Small World) xây một graph nhiều layer. Layer trên thưa, dùng để "nhảy" nhanh đến vùng gần; layer dưới dày, dùng để tinh chỉnh. Query đi từ layer cao xuống, ở mỗi layer đi theo edge tới node gần query hơn.

```
layer 2:  o ───────────────── o
layer 1:  o ──── o ───── o ── o
layer 0:  o─o─o─o─o─o─o─o─o─o─o   (all vectors, many edges)
```

Tham số (README pgvector 0.8.7):
- `m` (lúc tạo, mặc định 16): số connection tối đa mỗi node mỗi layer. Tăng `m`: recall cao hơn, index lớn hơn, build chậm hơn.
- `ef_construction` (lúc tạo, mặc định 64): kích thước candidate list khi xây graph. Tăng: graph chất lượng hơn, build chậm hơn.
- `hnsw.ef_search` (lúc query, mặc định 40): kích thước candidate list khi tìm. Tăng: recall cao hơn, chậm hơn. Cần `ef_search >= LIMIT` để lấy đủ kết quả.

Ưu: tỷ lệ recall/latency thường tốt hơn IVFFlat, **không cần dữ liệu trước** khi tạo index và chèn thêm dần vẫn ổn. Nhược: build lâu hơn, index lớn hơn, tốn RAM; nên để graph vừa trong `maintenance_work_mem` khi build thì mới nhanh.

### 2.4 Size limits

Theo README: index `vector` hỗ trợ tối đa 2.000 chiều; `halfvec` 4.000 chiều; `bit` 64.000; `sparsevec` tối đa 1.000 phần tử khác không. Vượt thì dùng `halfvec`, dimensionality reduction (nếu model hỗ trợ), hoặc quantization. Index trên biểu thức `halfvec`: `CREATE INDEX ON items USING hnsw ((embedding::halfvec(3)) halfvec_l2_ops);` (ví dụ nguyên văn từ README, với 3 chiều minh họa).

### 2.5 Filtering combined with metadata

Query thực tế luôn có điều kiện: `WHERE tenant_id = 7`. Index vector duyệt theo distance, **không** biết điều kiện đó. PostgreSQL thường làm: index trả `ef_search` candidate gần nhất toàn cục, **rồi** filter theo `WHERE`. Nếu điều kiện có selectivity cao (chỉ 1% dòng thỏa), trong 40 candidate có thể chỉ còn 0 đến 1 dòng đạt, nên bạn nhận **ít hơn k kết quả**, thậm chí rỗng, dù dữ liệu đúng tồn tại. Đây là lỗi gây khó chịu nhất khi đưa ANN vào sản phẩm multi-tenant.

Các cách xử lý:
1. **Iterative scan** (pgvector 0.8): `SET hnsw.iterative_scan = strict_order | relaxed_order`. Index tiếp tục scan thêm cho tới khi đủ kết quả sau filter. `strict_order` giữ đúng thứ tự distance; `relaxed_order` cho recall tốt hơn với thứ tự lệch nhẹ (có thể sắp lại bên ngoài). Giới hạn `hnsw.max_scan_tuples` mặc định 20.000 tuple (README). IVFFlat có `ivfflat.iterative_scan` và `ivfflat.max_probes`.
2. **Index B-tree trên cột filter** và để planner dùng: khi điều kiện có selectivity cao, nó scan vài nghìn dòng rồi sắp xếp chính xác, kết quả đúng 100%.
3. **Partial index** hoặc **partition theo tenant** khi có ít tenant lớn.
4. Tăng `ef_search` (chỉ chữa triệu chứng, tốn latency).

Kết quả thực đo ở mục 3 cho thấy cả ba kiểu.

### 2.6 How to choose

| Tình huống | Gợi ý |
|---|---|
| Dưới vài chục nghìn dòng, hoặc filter rất selective | Không cần vector index, exact search |
| Cần recall cao, latency thấp, dữ liệu thay đổi dần | HNSW |
| Resource build/RAM hạn chế, chấp nhận recall thấp hơn, dữ liệu ít đổi | IVFFlat |
| Vector quá lớn cho RAM | `halfvec`, dimensionality reduction, hoặc cân nhắc quantization |

## 3. Lab: 50,000 synthetic vectors, 384 dimensions

Mã nguồn đầy đủ trong `lab/`. Chạy lại bằng `lab/run.sh` (xem README). Thiết lập: PostgreSQL 18 với pgvector 0.8.7 (`pgvector/pgvector:0.8.7-pg18-trixie`), container giới hạn bộ nhớ, không map port.

Dữ liệu: 200 centroid ngẫu nhiên đã normalize; mỗi vector = centroid + noise, rồi normalize (để có cấu trúc cluster như embedding thật; dữ liệu ngẫu nhiên thuần túy sẽ làm mọi ANN trông tệ hơn thực tế). 100 query sinh cùng cách. Ground truth = exact search trước khi tạo index. Distance: cosine.

Quy mô là **50.000 dòng** chứ không phải 100.000. Lần chạy đầu ở 100.000 dòng trên máy dùng chung với nhiều process khác: build HNSW `m=32, ef_construction=128` mất khoảng 410 giây và index 202 MB (số đo thật từ lần chạy đó), tổng thời gian vượt giới hạn 600 giây tôi đặt cho mỗi bước nên kết quả bị mất. Bản cuối chạy ở 50.000 dòng (bảng `items` 156 MB ở 100k, nửa đó ở 50k). Đổi lại số dòng trong `lab/sql/01-data.sql` nếu bạn muốn chạy lại ở quy mô lớn.

### Real results (final run, `lab/results.txt`)

100 query, top-10, distance cosine. `build_s` là thời gian `CREATE INDEX` (giây); `index_mb` là `pg_relation_size` của index; `avg_ms` và `p95_ms` là latency mỗi query đo trong server (bỏ network latency); `rows` là số dòng trung bình trả về.

| Cấu hình | build (s) | index (MB) | recall@10 | avg (ms) | p95 (ms) | rows |
|---|---|---|---|---|---|---|
| exact (seq scan) | 0 | 0 | 1,000 | 130,01 | 241,92 | 10,0 |
| HNSW m=16, efc=64, ef_search=10 | 58,7 | 97,7 | 0,824 | 2,79 | 12,17 | 10,0 |
| HNSW m=16, efc=64, ef_search=40 | 58,7 | 97,7 | 0,899 | 4,35 | 14,31 | 10,0 |
| HNSW m=16, efc=64, ef_search=100 | 58,7 | 97,7 | 0,930 | 3,82 | 13,47 | 10,0 |
| HNSW m=32, efc=128, ef_search=40 | 111,5 | 101,4 | 0,987 | 1,11 | 1,83 | 10,0 |
| HNSW m=32, efc=128, ef_search=100 | 111,5 | 101,4 | 0,987 | 1,89 | 3,35 | 10,0 |
| IVFFlat lists=50, probes=1 | 3,0 | 78,2 | 1,000 | 1,90 | 3,59 | 10,0 |
| IVFFlat lists=50, probes=10 | 3,0 | 78,2 | 1,000 | 13,60 | 21,86 | 10,0 |
| IVFFlat lists=50, probes=25 | 3,0 | 78,2 | 1,000 | 39,61 | 56,94 | 10,0 |
| IVFFlat lists=224, probes=1 | 4,8 | 78,7 | 0,969 | 1,10 | 2,39 | 10,0 |
| IVFFlat lists=224, probes=15 | 4,8 | 78,7 | 1,000 | 5,44 | 8,99 | 10,0 |
| IVFFlat lists=224, probes=50 | 4,8 | 78,7 | 1,000 | 16,41 | 24,61 | 10,0 |

Filter `category = $2` (1% số dòng, khoảng 500 dòng), index HNSW m=32, `ef_search=40`:

| Cách xử lý | recall@10 so với exact có filter | avg (ms) | p95 (ms) | rows |
|---|---|---|---|---|
| HNSW, `iterative_scan = off` | 0,000 | 1,42 | 2,22 | **0,0** |
| HNSW, `relaxed_order` | 0,592 | 187,28 | 415,76 | 10,0 |
| HNSW, `strict_order` | 0,331 | 138,34 | 269,00 | 10,0 |
| B-tree trên `category` + sắp xếp chính xác (không dùng vector index) | 1,000 | 1,97 | 9,84 | 10,0 |

### Reading the results (and what not to over-conclude)

1. **Exact vs ANN.** Scan toàn bộ 50.000 vector mất trung bình 130 ms; các cấu hình index có recall tốt cho 1 đến 5 ms. Chênh lệch này sẽ lớn hơn nữa khi số dòng tăng, vì exact tăng tuyến tính.
2. **HNSW: `m` và `ef_construction` quyết định recall ceiling.** Với `m=16, ef_construction=64` (mặc định), tăng `ef_search` từ 10 lên 40 rồi 100 nâng recall 0,824, 0,899, 0,930 nhưng chạm ceiling dưới 1. Graph tốt hơn (`m=32, ef_construction=128`) đạt 0,987 ngay ở `ef_search=40`, đổi lại build chậm gấp khoảng 1,9 lần (111,5 s so với 58,7 s) và index lớn hơn khoảng 4% (101,4 MB so với 97,7 MB). `ef_search` chỉ chữa được phần còn lại, không bù được graph xây kém.
3. **IVFFlat build nhanh hơn nhiều và index nhỏ hơn**: 3 đến 5 giây thay vì 59 đến 112 giây, 78 MB thay vì 98 đến 101 MB. Với `lists=224`, `probes=1` đã đạt 0,969; `probes=15` đạt 1,000. Tăng `probes` làm latency tăng gần tuyến tính (5,4 ms ở 15 probes, 16,4 ms ở 50).
4. **Cảnh báo về dữ liệu tổng hợp.** Dữ liệu của lab có 200 cluster rất rõ rệt, nên k-means của IVFFlat bắt đúng cấu trúc và recall ở `lists=50, probes=1` là 1,000 vì mọi neighbor thật nằm cùng một cluster. Dữ liệu embedding thật ít tách cluster rạch ròi hơn, và khi đó IVFFlat thường cần `probes` cao hơn nhiều. **Đừng suy ra "IVFFlat tốt hơn HNSW" từ bảng này**; hãy chạy lại bằng embedding thật của bạn. Kết quả HNSW ở tham số mặc định (0,82 đến 0,93) cũng phản ánh đặc điểm dữ liệu gồm các cluster tách biệt: graph khó nối giữa các cluster.
5. **Latency có noise.** Máy chạy cùng lúc nhiều process khác nên p95 dao động mạnh, và có chỗ latency ở `ef_search=100` (3,82 ms) thấp hơn ở `ef_search=40` (4,35 ms), điều không thể đúng về mặt cơ chế mà là noise khi đo. So sánh thứ tự lớn (1 ms so với 130 ms), đừng so sánh chênh vài phần mười mili-giây.
6. **Filter là chỗ ANN hỏng thầm lặng.** Với điều kiện selectivity 1% và `ef_search=40`, HNSW **không trả về dòng nào** trong 100 query (rows = 0, recall 0): index lấy 40 candidate gần nhất toàn cục rồi `WHERE` loại gần hết. Iterative scan sửa việc trả thiếu (đủ 10 dòng) nhưng recall chỉ 0,59 (`relaxed_order`) và 0,33 (`strict_order`), và latency vọt lên 140 đến 190 ms, vì scan bị chặn bởi `hnsw.max_scan_tuples` (mặc định 20.000, README pgvector) trong khi chỉ 1% dòng thỏa điều kiện; tôi **chưa kiểm tra** việc tăng giá trị này có cải thiện recall hay không. Trong trường hợp này lựa chọn tốt nhất lại là không dùng vector index: B-tree trên `category` rồi sắp xếp chính xác khoảng 500 dòng cho recall 1,000 trong khoảng 2 ms trung bình, và index B-tree chỉ nặng 0,4 MB.

Bài học vận hành: đo recall bằng exact làm ground truth, đo cả kết quả có filter đúng như query thật, và chọn cấu trúc theo selectivity của điều kiện filter. Với `tenant_id` có vài trăm tenant (mỗi tenant vài phần trăm dữ liệu hoặc nhỏ hơn), đây là tình huống 1% nói trên, nên cân nhắc partition theo tenant hoặc B-tree + exact cho tenant nhỏ.

## 4. Pitfalls

- Tạo IVFFlat trên bảng rỗng hoặc gần rỗng: centroid vô nghĩa, recall tệ. Build sau khi nạp dữ liệu.
- Quên đặt `SET ivfflat.probes` / `hnsw.ef_search` rồi kết luận "index kém" vì để mặc định.
- Đo latency trên warm cache, không đo p95, không đo cùng lúc nhiều query.
- Không đo recall: ANN luôn cho kết quả, đúng hay sai bạn không thấy nếu không so với exact.
- Filter `WHERE` sau index khiến trả thiếu kết quả (mục 2.5).
- `ORDER BY` bằng biểu thức khác operator của index (ví dụ index `vector_l2_ops` nhưng query `<=>`): index không được dùng.
- Build HNSW với `maintenance_work_mem` quá nhỏ: build chậm đi rất nhiều; có warning trong log khi graph không vừa memory.

## 5. Summary

1. Exact search luôn đúng và là ground truth; với N nhỏ hoặc query filter mạnh thì thường đủ nhanh.
2. ANN đánh đổi recall lấy tốc độ; đo recall@k so với exact trên dữ liệu của bạn.
3. HNSW: `m`, `ef_construction` quyết định chất lượng và chi phí build; `ef_search` quyết định recall/latency lúc query. IVFFlat: `lists` lúc build, `probes` lúc query.
4. Filter metadata sau index có thể trả thiếu kết quả; dùng iterative scan, B-tree, partial index hoặc partition.
5. Tham số query là operational knob, không phải hằng số: chỉnh bằng số đo.

## 6. Self-check questions

1. Recall@10 bằng 0,92 nghĩa là gì?
2. Vì sao IVFFlat không nên build trên bảng rỗng?
3. Query `WHERE tenant_id = 7 ORDER BY emb <=> $1 LIMIT 10` qua HNSW chỉ trả 2 dòng dù tenant có hàng nghìn dòng. Nguyên nhân và hai cách khắc phục?
4. Tăng `ef_search` ảnh hưởng gì?

<details><summary>Answer</summary>

1. Trung bình trong 10 kết quả đúng nhất (theo exact), index tìm lại được 9,2 kết quả.
2. IVFFlat tính centroid bằng k-means từ dữ liệu lúc build; không có dữ liệu thì centroid không đại diện cho distribution thật, recall thấp.
3. Index lấy `ef_search` candidate gần nhất toàn cục rồi mới filter `tenant_id`, nên còn ít dòng. Khắc phục: `hnsw.iterative_scan`, B-tree trên `tenant_id` để planner chọn scan chính xác, partial index/partition, hoặc tăng `ef_search`.
4. Recall tăng, latency tăng (duyệt nhiều candidate hơn); không ảnh hưởng kích thước index hay thời gian build.

</details>
