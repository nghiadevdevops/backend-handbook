# Chương 2. Bức tranh model và nhà cung cấp (tra ngày 07/11/2026)

## 1. Tình huống

Trưởng nhóm hỏi: "Dùng model nào cho ShopAssist? Rẻ nhất? Mạnh nhất? Có nên tự host?" Danh sách model đổi theo tháng, nên chương này **không dạy bạn nhớ tên model**. Nó dạy cách tra, cách so sánh và cách thiết kế để đổi model không đau. Các bảng dưới đây là ảnh chụp tại **07/11/2026**, lấy từ trang docs chính thức. Số liệu qua công cụ đọc trang tự động, hãy mở lại trang gốc trước khi quyết định ngân sách.

## 2. Ảnh chụp ngày 07/11/2026

### 2.1 Anthropic (nguồn: platform.claude.com, trang Models overview)

| Model | API ID | Giá input / output (mỗi triệu token) | Context | Max output |
|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | $10 / $50 | 1M | 128K |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 | 1M | 128K |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 | 1M | 128K |
| Claude Haiku 5.5 | `claude-haiku-5-5` | từ $0,10 / từ $0,50 | 1M | 128K |

Ghi chú từ trang đó: docs gợi ý bắt đầu với Opus 5.5 cho phần lớn tải, Fable 5.1 cho reasoning khó và tác vụ agent dài, Haiku 5.5 cho classification, extraction, routing khối lượng lớn. Cache read bằng 10% giá input, riêng Opus 5.5 và Sonnet 5.5 là 5%, Fable 5.1 là 2,5%. Batch API giảm 50%. Mọi ID là snapshot cố định. Có cam kết ngày ngừng hỗ trợ tối thiểu (ví dụ Sonnet 5.5 "không sớm hơn 28/09/2027"). Nhiều model thế hệ trước được xếp vào "legacy" nhưng vẫn dùng được.

### 2.2 OpenAI (nguồn: developers.openai.com/api/docs/models)

| Model | ID | Input / output (mỗi triệu token) | Ghi chú |
|---|---|---|---|
| GPT-6 Astra | `gpt-6-astra` | $10 / $50 | mạnh nhất, reasoning và code phức tạp |
| GPT-6.1 Sol | `gpt-6.1-sol` | $2 / $10 | gần Astra, rẻ hơn |
| GPT-6.1 Terra | `gpt-6.1-terra` | $1 / $5 | nhanh, hiệu quả |
| GPT-6 Luna | `gpt-6-luna` | $0,10 / $0,50 | tối ưu khối lượng lớn |

Trang liệt kê context 1,05M và output tối đa 128K cho các model này, và có mục "xem thêm" nên có thể còn model khác chưa ghi ở đây.

### 2.3 Google (nguồn: aistudio.google.com/docs/models)

Các model đang nêu: `gemini-4-argon` (flagship, context 1M token), `gemini-3.8-flash` (nhãn "New"), `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` (nhãn Stable); `gemini-3.1-pro-preview` còn ở dạng preview. Embedding: `gemini-embedding-2` (đa phương thức) và `gemini-embedding-001`. Trang cảnh báo `gemini-2.5-flash` và `gemini-2.5-pro` đã deprecated và sẽ được route sang model khác từ 01/12/2026. Giá Gemini: **chưa xác minh** (không tra được trong lần này), hãy xem trang pricing của Google.

### 2.4 Open-weight

"Open-weight" là model công bố weights để bạn tải về chạy, khác "open-source" đúng nghĩa (code training, dữ liệu, license tự do). Bảng xếp hạng thay đổi hàng tháng và các nguồn tôi tìm được cho 11/2026 đều là blog thứ cấp, không phải nguồn chính thống, nên **cuốn này không xếp hạng model open-weight**. Cách làm đúng khi bạn cần: mở bảng xếp hạng cập nhật (ví dụ Hugging Face) và đọc model card của chính nhà phát hành. Hãy đọc kỹ **license** vì có model giới hạn dùng thương mại, giới hạn quy mô người dùng, hoặc yêu cầu ghi nhận; bản tóm tắt thứ cấp nói rằng một số dòng phổ biến có license hạn chế (chưa xác minh từng trường hợp).

Khi nào self-host hợp lý: dữ liệu không được rời hạ tầng, tải rất lớn và ổn định để GPU không nhàn rỗi, cần fine-tune sâu, hoặc cần chạy offline. Khi nào không: lưu lượng thấp hoặc thất thường (API tính theo dùng, GPU thì tính theo giờ), nhóm chưa có người vận hành GPU. Embedding là trường hợp self-host dễ nhất vì model nhỏ, chạy được trên CPU.

## 3. Tiêu chí chọn model

```
requirements ──▶ shortlist 2-3 model ──▶ run your evals ──▶ compare (quality, $/task, p95 latency)
                                                                  │
                              cheaper model good enough? ◀────────┘
```

1. **Chất lượng trên tác vụ của bạn**, đo bằng eval riêng (chương 8). Benchmark công khai chỉ để lọc đầu vào.
2. **Chi phí trên mỗi tác vụ hoàn thành**, không phải giá mỗi triệu token. Model đắt hơn nhưng làm đúng trong một lượt có thể rẻ hơn model rẻ phải thử ba lần.
3. **Latency**: p50 và p95, TTFT và generation speed, đo ở đúng deployment region của bạn.
4. **Tính năng**: tool calling, structured output, image/PDF input, caching, batch, độ dài output.
5. **Dữ liệu và compliance**: nơi xử lý dữ liệu, chính sách lưu và training trên dữ liệu khách, vùng địa lý, hợp đồng (DPA).
6. **Vòng đời**: lịch deprecate. Cả Anthropic và Google đều công bố ngày ngừng hỗ trợ; model preview không nên là xương sống của production.
7. **Rủi ro vendor lock-in**: giữ abstraction layer mỏng để chuyển được.

## 4. Thiết kế để đổi model không đau

Ý tưởng: tên model là cấu hình, không phải code. Một layer tách biệt quyết định model theo "vai trò" (role).

```ts
// src/config.ts (ShopAssist), dùng xuyên suốt các chương. Tên model là cấu hình, không phải code.
export const config = {
  promptVersion: "2026-11-07",
  models: {
    // Role => [provider, model id, ngày kiểm tra giá]
    router: ["anthropic", "claude-haiku-5-5", "2026-11-07"],
    answer: ["anthropic", "claude-sonnet-5-5", "2026-11-07"],
    fallback: ["openai", "gpt-6.1-sol", "2026-11-07"],
  },
  embedding: { provider: "self-hosted", dimensions: 384 },
} as const;
```

Mẹo: model nhỏ làm "router" classify câu hỏi (hỏi đơn hàng, hỏi chính sách, ngoài phạm vi), model vừa trả lời, model mạnh chỉ dùng cho ca khó. Đây thường giảm chi phí nhiều nhất mà không cần động tới prompt.

## 5. Trade-off

- Một nhà cung cấp: đơn giản, tận dụng caching và tính năng riêng; đổi lại bị vendor lock-in. Nhiều nhà cung cấp: bền hơn nhưng mỗi nhà một kiểu schema tool, caching, lỗi; bạn phải test cả hai.
- Dùng bản alias hay pin snapshot: pin để hành vi ổn định, alias để tự nâng cấp. Production nên pin và nâng cấp có chủ đích sau khi chạy eval.
- Không nên chọn model theo "tin tức". Chỉ chọn theo số đo trên dữ liệu của bạn.

## 6. Cạm bẫy

- Chép tên model và giá từ bài blog (kể cả cuốn sách này) vào code mà không kiểm tra ngày.
- So giá mỗi token giữa các nhà cung cấp mà quên tokenizer khác nhau: cùng văn bản ra số token khác nhau.
- Dùng model preview làm đường chính, rồi bị ngừng với thông báo ngắn.
- Không có phương án fallback khi một nhà cung cấp lỗi hoặc giới hạn rate (chương 10).
- Bỏ qua điều khoản dữ liệu khi đưa thông tin khách hàng vào prompt.

## 7. Tóm tắt

1. Danh sách model và giá đổi liên tục; luôn tra trang chính thức và ghi ngày tra.
2. Chọn model bằng eval trên tác vụ của bạn, so chi phí trên mỗi tác vụ và p95 latency.
3. Routing theo vai trò (router nhỏ, answer vừa, ca khó mạnh) thường tiết kiệm nhiều nhất.
4. Tên model nằm trong config; pin snapshot ở production; theo dõi lịch deprecate.
5. Open-weight hợp khi có ràng buộc dữ liệu hoặc tải lớn ổn định; đọc kỹ license.

## 8. Câu hỏi tự kiểm tra

1. Vì sao không nên chọn model chỉ dựa vào giá mỗi triệu token?
2. Nêu ba điều kiện khiến self-host open-weight hợp lý.
3. Vì sao nên pin snapshot ở production, và khi nâng cấp cần làm gì?
4. "Router" model hoạt động thế nào và tiết kiệm ở đâu?

<details><summary>Đáp án</summary>

1. Giá tổng phụ thuộc số token thực tế (tokenizer khác nhau), số lần gọi lại, độ dài output và tỷ lệ làm đúng. Nên so chi phí trên mỗi tác vụ đúng.
2. Dữ liệu không được rời hạ tầng; tải lớn và ổn định đủ lấp đầy GPU; cần fine-tune sâu hoặc chạy offline. (Cũng cần có người vận hành.)
3. Hành vi model đổi theo phiên bản; pin giữ kết quả ổn định. Khi nâng cấp: chạy bộ eval và so với baseline, kiểm tra chi phí/latency, rồi mới chuyển.
4. Model nhỏ rẻ classify câu hỏi trước; chỉ câu cần mới đẩy lên model đắt. Tiết kiệm vì đa số lưu lượng là câu dễ.

</details>
