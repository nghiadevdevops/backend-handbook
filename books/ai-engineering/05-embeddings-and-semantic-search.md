# Chương 5. Embeddings và semantic search

## 1. Tình huống

Kho tri thức của ShopAssist có bài "Chính sách hoàn tiền". Nhân viên gõ "khách muốn lấy lại tiền thì sao". `LIKE '%lấy lại tiền%'` và cả full-text search đều trượt vì bài viết dùng chữ "hoàn tiền", "refund". Keyword không khớp nhưng **ý nghĩa** thì khớp. Embeddings cho phép tìm theo ý nghĩa.

## 2. Khái niệm

### 2.1 Embedding là gì

Embedding là một **vector số thực** (ví dụ 384 hoặc 1.024 số) do một model đặc biệt (embedding model) sinh ra từ văn bản, sao cho văn bản có ý nghĩa gần nhau thì vector gần nhau trong vector space. Embedding model **khác** model chat: nó chỉ đọc văn bản và trả vector, không sinh chữ, nên nhỏ, rẻ và nhanh hơn nhiều. Embedding model cũng có thể chạy tự host trên CPU.

```
"hoàn tiền cho khách"        ─▶ [0.12, -0.40, 0.88, ...]  ┐ close
"khách muốn lấy lại tiền"    ─▶ [0.10, -0.37, 0.91, ...]  ┘
"cách đổi mật khẩu"          ─▶ [-0.70, 0.22, 0.05, ...]    far
```

Quy trình semantic search:
1. **Indexing (offline)**: cắt tài liệu thành chunk, embed từng chunk, lưu vector cùng văn bản và metadata vào database.
2. **Query (online)**: embed câu hỏi bằng **đúng cùng model**, tìm k vector gần nhất, trả về các chunk tương ứng.

### 2.2 Đo độ gần

pgvector hỗ trợ các operator distance (theo README pgvector, tra 07/11/2026, phiên bản 0.8.7):

| Operator | Meaning | Operator class cho index |
|---|---|---|
| `<->` | Euclidean distance (L2) | `vector_l2_ops` |
| `<=>` | cosine distance (1 - cosine similarity) | `vector_cosine_ops` |
| `<#>` | **negative** inner product | `vector_ip_ops` |
| `<+>` | L1 distance | `vector_l1_ops` |

Cách chọn thực tế: dùng cách mà **nhà cung cấp model khuyên**, thường là cosine. Nếu vector đã được normalize về độ dài 1 (nhiều model làm sẵn), cosine, inner product và L2 cho **cùng thứ tự ranking**; khi đó inner product nhanh nhất. Lưu ý `<#>` trả về giá trị âm của inner product vì index chỉ hỗ trợ sắp xếp tăng dần; nhân với -1 để lấy inner product thật.

Cosine similarity = `1 - (a <=> b)`. Luôn sắp xếp bằng `ORDER BY embedding <=> $1 LIMIT k` để index dùng được; bọc phép tính phức tạp quanh operator sẽ làm planner bỏ qua index.

### 2.3 Chọn embedding model

Tiêu chí:
- **Chất lượng với ngôn ngữ của bạn.** Tiếng Việt là điểm yếu của nhiều model thiên về tiếng Anh. Kiểm tra model có hỗ trợ multilingual và **tự đo** bằng bộ câu hỏi thật (chương 8).
- **Dimensions.** Nhiều chiều thường tốt hơn một chút nhưng tốn bộ nhớ, thời gian build index và latency. Một số model cho chọn số chiều khi gọi (docs Ollama ghi `dimensions` là tham số tùy chọn của `/api/embed`, và một số SDK nhà cung cấp cho truyền `dimensions` trong request; với từng nhà cung cấp hãy đọc docs, chưa xác minh).
- **Giới hạn độ dài input** (token mỗi chunk).
- **Chi phí và nơi chạy**: API trả phí hay tự host.
- **Multimodal**: tại 07/11/2026 docs Google liệt kê `gemini-embedding-2` là embedding đầu tiên của họ đưa văn bản, ảnh, video, âm thanh, PDF vào cùng vector space; bên cạnh `gemini-embedding-001` cho văn bản. Các nhà cung cấp khác có model riêng; tên và giá phải tra trên docs của họ (chưa xác minh trong cuốn này).

**Lock-in vào một model.** Vector của model A và model B **không so sánh được với nhau** (khác vector space, có khi khác số chiều). Đổi embedding model nghĩa là embed lại toàn bộ kho. Vì vậy:
- Lưu cột `embedding_model` (tên và phiên bản) cạnh vector.
- Thiết kế để có thể xây bảng/index mới song song rồi chuyển, không sửa tại chỗ.

### 2.4 Lưu trong PostgreSQL với pgvector

Kích thước: một cột `vector(d)` tốn khoảng `4*d + 8` byte mỗi dòng; `halfvec(d)` (số thực 16-bit) tốn `2*d + 8` (README pgvector). Với 1 triệu vector 384 chiều: khoảng 1,5 GB chỉ riêng vector; 1.024 chiều thì khoảng 4 GB. Đây là lý do dimensions ảnh hưởng trực tiếp đến RAM (chương 6).

Schema của ShopAssist dùng xuyên suốt:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_chunks (
  id               bigserial PRIMARY KEY,
  doc_id           bigint      NOT NULL,        -- bài viết gốc
  tenant_id        int         NOT NULL,        -- cửa hàng nào sở hữu
  chunk_no         int         NOT NULL,
  content          text        NOT NULL,
  embedding        vector(384) NOT NULL,
  embedding_model  text        NOT NULL         -- ví dụ 'ten-model@phien-ban'
);

-- tìm 5 chunk gần nhất với query vector $1, trong cửa hàng của người hỏi
SELECT id, doc_id, content, 1 - (embedding <=> $1) AS cosine_sim
FROM kb_chunks
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 5;
```

Mệnh đề `WHERE tenant_id = $2` là **security boundary**, không phải tối ưu hóa. Chương 6 nói vì sao kết hợp filter với index vector không hề tầm thường, và chương 9 nói vì sao không bao giờ để model tự quyết định `tenant_id`.

### 2.5 Ví dụ nhỏ để thấy cơ chế

Dùng vector 3 chiều viết tay (không phải embedding thật, chỉ minh họa phép đo):

```sql
CREATE TEMP TABLE demo(id int, label text, v vector(3));
INSERT INTO demo VALUES
 (1,'hoan tien',      '[0.9, 0.1, 0.0]'),
 (2,'lay lai tien',   '[0.8, 0.2, 0.1]'),
 (3,'doi mat khau',   '[0.0, 0.1, 0.9]');
SELECT label, round((1 - (v <=> '[0.85,0.15,0.05]'))::numeric, 3) AS cosine_sim
FROM demo ORDER BY v <=> '[0.85,0.15,0.05]';
```

Kết quả thật (PostgreSQL 18, pgvector 0.8.7, chạy bằng `lab/sql/00-semantic-demo.sql`):

```
    label     | cosine_sim
--------------+------------
 hoan tien    |      0.996
 lay lai tien |      0.996
 doi mat khau |      0.077
```

Hai nhãn "hoan tien" và "lay lai tien" (khác từ ngữ, cùng ý trong ví dụ giả lập) gần nhau, còn "doi mat khau" xa. Đo thêm cùng script với hai vector `[1,2,3]` và `[4,5,6]`: `<->` ra 5,196; `<=>` ra 0,0254; `<#>` ra -32 (inner product 32 mang dấu âm); `<+>` ra 9. Kích thước thật đo bằng `pg_column_size`: `vector(3)` là 20 byte (đúng `4*3 + 8`), `halfvec(3)` là 14 byte (đúng `2*3 + 8`).

### 2.6 Giới hạn của semantic search

- Kém với **mã, ID, tên riêng, số hiệu** (ví dụ "A1029", "điều 12.3"): đây là chỗ keyword search thắng. Giải pháp là hybrid search (chương 7).
- Distance chỉ cho thứ tự, **không có threshold "đúng"** phổ quát. Threshold của cosine thay đổi theo model và dữ liệu; phải calibrate bằng dữ liệu của bạn.
- Query ngắn mơ hồ cho kết quả lộn xộn.
- Embedding mã hóa ý nghĩa chứ không phải sự thật: đoạn nói "chúng tôi KHÔNG hoàn tiền" vẫn gần với truy vấn về hoàn tiền.

## 3. Trade-off

| Lựa chọn | Nghiêng về | Đổi lại |
|---|---|---|
| Nhiều chiều | độ chính xác | RAM, build, latency |
| `halfvec` | nửa dung lượng | giảm precision số học, kiểm bằng recall |
| API embedding | không vận hành | chi phí, dữ liệu rời hạ tầng |
| Tự host embedding | kiểm soát, chi phí cố định | phải vận hành, tự đo chất lượng |
| Chỉ vector | hiểu ý | trượt mã/ID/tên riêng |

Không nên dùng embedding khi: dữ liệu có cấu trúc, query chính xác (tra theo mã đơn, filter theo ngày): dùng SQL và index thường.

## 4. Cạm bẫy

- Embed câu hỏi bằng model khác với model dùng để index.
- Đổi model mà không embed lại, hoặc không ghi lại phiên bản đã dùng.
- Không normalize văn bản input nhất quán giữa lúc index và lúc query (prefix hướng dẫn mà model yêu cầu như "query:" hay "passage:" nếu có; đọc model card).
- Đặt threshold cosine cố định lấy từ bài blog.
- Quên `ORDER BY ... LIMIT`, dẫn tới full table scan và không dùng index.
- Bỏ filter quyền sở hữu (`tenant_id`) khỏi query.

## 5. Tóm tắt

1. Embedding biến văn bản thành vector sao cho gần về nghĩa thì gần về distance; embedding model khác chat model.
2. pgvector: `<->` L2, `<=>` cosine, `<#>` negative inner product, `<+>` L1; dùng `ORDER BY ... LIMIT` để index hoạt động.
3. Vector của các model khác nhau không so sánh được; lưu tên model và thiết kế để có thể embed lại.
4. Dimensions quyết định RAM: khoảng `4*d + 8` byte mỗi vector `vector(d)`.
5. Semantic search mạnh ở diễn đạt khác nhau, yếu ở mã/ID; cần kết hợp keyword search.

## 6. Câu hỏi tự kiểm tra

1. Vì sao không thể trộn vector của hai embedding model khác nhau trong cùng một index?
2. 2 triệu vector 768 chiều kiểu `vector` chiếm khoảng bao nhiêu byte riêng phần vector?
3. Khi vector đã normalize về độ dài 1, operator nào nhanh nhất và vì sao ranking vẫn như cosine?
4. Nêu một loại query mà semantic search làm kém.

<details><summary>Đáp án</summary>

1. Mỗi model có vector space riêng (và có thể khác số chiều), distance giữa hai vector khác model không có ý nghĩa.
2. (4×768 + 8) × 2.000.000 = 3.080 × 2.000.000 = 6.160.000.000 byte, khoảng 6,2 GB (chưa tính index và overhead của dòng).
3. Inner product (`<#>`): nó ít phép tính hơn; với vector độ dài 1, cosine = inner product nên thứ tự giống nhau (và L2 là hàm monotonic của chúng).
4. Mã hoặc ID cụ thể như "A1029", tên riêng, số điều khoản.

</details>
