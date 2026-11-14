# Chương 1. LLM hoạt động thế nào (ở mức developer cần biết)

## 1. Tình huống

Bạn thêm nút "Hỏi trợ lý" vào trang quản trị của ShopAssist, hệ thống đặt hàng mà cuốn này dùng xuyên suốt. Demo chạy ngon. Một tuần sau có ba chuyện: hóa đơn API gấp năm lần dự tính, có khách được trả lời sai chính sách đổi trả bằng giọng rất tự tin, và cùng một câu hỏi cho ra hai câu trả lời khác nhau. Cả ba đều giải thích được nếu bạn hiểu LLM làm gì bên trong. Chương này chỉ lấy phần cần để quyết định thiết kế, không đi vào toán.

## 2. Khái niệm

### 2.1 LLM là hàm "dự đoán token tiếp theo"

LLM (Large Language Model, mô hình ngôn ngữ lớn) nhận một chuỗi **token** và trả về probability distribution cho token kế tiếp. Muốn sinh một câu, ứng dụng (hoặc server của nhà cung cấp) lặp: chọn một token từ distribution, nối vào chuỗi, hỏi lại. Mọi thứ khác (chat, tool calling, JSON) đều xây trên vòng lặp này.

```
prompt tokens ──▶ [ model ] ──▶ probabilities ──▶ sample 1 token
        ▲                                                 │
        └────────── append chosen token to end ◀──────────┘
```

Hệ quả cho developer: model không "tra cứu" gì cả. Nó không có bước kiểm tra sự thật. Nó sinh ra chuỗi có khả năng cao nhất theo những gì đã học và những gì nằm trong prompt.

### 2.2 Token

Token là đơn vị văn bản mà model đọc, thường là một mảnh từ (vài ký tự). Tiếng Anh trung bình ngắn hơn tiếng Việt về số token cho cùng nội dung vì tokenizer được tối ưu cho tiếng Anh nhiều hơn; tiếng Việt có dấu thường tốn nhiều token hơn. Con số cụ thể phụ thuộc tokenizer của từng model, và nhà cung cấp có thể đổi tokenizer giữa các thế hệ. Docs Anthropic (tra 07/11/2026) ghi 1M token tương đương khoảng 555 nghìn từ tiếng Anh với tokenizer hiện tại, trong khi các model trước đó chứa được khoảng 750 nghìn từ. Cùng một văn bản, đổi model có thể đổi số token, nghĩa là đổi hóa đơn.

Quy tắc thực hành:
- **Đếm bằng công cụ của nhà cung cấp** (endpoint đếm token hoặc trường `usage` trong response), không ước lượng bằng số ký tự.
- Mọi thứ đều tính token: system prompt, conversation history, định nghĩa tool, kết quả tool, và cả phần model "suy nghĩ" nếu bật chế độ reasoning.

### 2.3 Context window

Context window là số token tối đa model xử lý trong một lượt (input + output). Docs Anthropic (07/11/2026) liệt kê 1M token context và 128K token output tối đa cho các model hiện hành; docs OpenAI liệt kê 1,05M context và 128K output cho các model GPT-6.x. Đây là con số của ngày tra, không phải hằng số.

Ba điều hay bị hiểu sai:
1. **Context window không phải bộ nhớ.** API không có trạng thái: mỗi request bạn gửi lại toàn bộ history. Chat dài nghĩa là input mỗi lượt dài ra, tổng chi phí tăng gần như bậc hai theo số lượt (chương 10 nói cách giảm bằng cache).
2. **Chứa được không có nghĩa là dùng tốt.** Nhồi 500 trang vào prompt thường kém hơn đưa đúng 5 trang liên quan. Đó là lý do RAG (chương 7) vẫn còn đất sống dù context đã tới 1M.
3. **Vị trí thông tin quan trọng.** Thông tin nằm giữa một đoạn rất dài dễ bị bỏ sót hơn thông tin ở đầu hoặc cuối. Hãy đo bằng eval của bạn (chương 8) thay vì tin.

### 2.4 Sampling và temperature

Từ probability distribution, có nhiều cách chọn token:
- **Greedy**: luôn chọn token có probability cao nhất. Gần như deterministic.
- **Temperature**: chia logit trước khi softmax. Thấp (gần 0) làm distribution nhọn, kết quả ổn định; cao làm distribution phẳng, kết quả đa dạng hơn và dễ lạc hơn.
- **top-p / top-k**: chỉ sampling trong nhóm token có cumulative probability tới p, hoặc k token đầu.

Lưu ý thực tế quan trọng: **temperature 0 không bảo đảm kết quả giống hệt nhau** giữa các lần gọi (batching, phép tính số thực song song trên GPU, thay đổi phía server). Ngoài ra một số reasoning model hiện nay không cho chỉnh tham số sampling, hoặc chỉ nhận một số giá trị. Trước khi code `temperature => 0`, hãy đọc trang tham số của đúng model bạn dùng (chưa xác minh cho từng model trong cuốn này). Thiết kế đúng là: nếu cần ổn định, **ép output vào schema** (chương 3) và **kiểm tra bằng code**, đừng dựa vào "xin model đừng thay đổi".

### 2.5 Vì sao có hallucination

Hallucination là model sinh ra nội dung nghe hợp lý nhưng sai sự thật. Nguyên nhân cơ chế, không phải "lỗi vặt":
- Mục tiêu training là sinh văn bản có khả năng cao, không phải văn bản đúng.
- Kiến thức nằm trong weights ở dạng nén, mất mát; với dữ kiện hiếm (mã đơn hàng, điều khoản nội bộ) model không có gì để dựa vào.
- Không có dữ liệu thì model vẫn phải chọn token tiếp theo, nên nó "điền chỗ trống".
- Training data có điểm cắt (knowledge cutoff): docs Anthropic ghi cutoff tin cậy là 06/2026 cho các model hiện hành. Sau mốc đó model không biết gì, trừ khi bạn đưa vào context.

Cách giảm (không bao giờ về 0): đưa dữ liệu thật vào context (RAG), bắt model gắn citation, cho phép nói "không biết", dùng tool để lấy dữ kiện, và kiểm chứng output bằng code khi có thể.

### 2.6 Chi phí và latency

Giá tính theo token, input và output giá khác nhau, output đắt hơn. Ví dụ giá niêm yết tra từ trang models của Anthropic ngày 07/11/2026: Claude Sonnet 5.5 là $2 / triệu token input, $10 / triệu token output; Claude Opus 5.5 là $4 / $20. Ngoài ra có giảm giá batch (docs ghi 50%) và giá đọc từ prompt cache rẻ hơn nhiều (chương 3 và 10). Giá có thể đổi, luôn đọc trang pricing hiện hành trước khi lập kế hoạch.

Công thức ước lượng một lượt:

```
chi_phi = input_tokens * gia_in + output_tokens * gia_out
```

Latency có hai thành phần:
- **TTFT** (time to first token): thời gian tới token đầu, phụ thuộc độ dài input và tải server.
- **Generation speed**: token/giây, nên latency tổng ≈ TTFT + output_tokens / speed. Output dài là nguồn latency chính. Do đó **streaming** (chương 10) cải thiện cảm giác chờ dù không giảm tổng thời gian.

Ví dụ nhanh cho ShopAssist: mỗi câu hỏi gửi 3.000 token (system prompt + 4 đoạn tài liệu) và nhận 300 token. Với giá $2/$10 mỗi triệu: 3.000 × 2/1.000.000 = $0,006 input, 300 × 10/1.000.000 = $0,003 output, tổng $0,009 mỗi câu. Một nghìn câu một ngày là $9/ngày. Nếu conversation history nhồi thêm 20.000 token mỗi lượt, input thành $0,046 và hóa đơn gấp khoảng năm lần. Đó chính là chuyện mở đầu chương.

## 3. Ví dụ: gọi API ở mức thấp nhất

Chỉ để thấy hình dạng request; cần API key để chạy, ở đây chưa chạy được. Cú pháp theo docs Anthropic (07/11/2026), header phiên bản `anthropic-version: 2026-10-21` đúng như ví dụ trong docs đó.

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2026-10-21" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-5-5",
    "max_tokens": 300,
    "system": "Bạn là trợ lý chăm sóc khách hàng của ShopAssist.",
    "messages": [{"role": "user", "content": "Chính sách đổi trả bao lâu?"}]
  }'
```

Response có `content` (mảng khối), `stop_reason` và `usage` (số token input/output). Hãy log `usage` ngay từ ngày đầu; đó là dữ liệu quan trọng nhất cho chi phí và debug.

## 4. Trade-off

| Quyết định | Nghiêng về | Đổi lại |
|---|---|---|
| Model lớn vs nhỏ | Lớn: chất lượng, reasoning | Giá và latency cao |
| Context dài vs RAG | Context dài: đơn giản | Đắt, loãng thông tin |
| Temperature thấp vs cao | Thấp: ổn định (cho trích xuất) | Cao: đa dạng (cho brainstorm) |

Khi KHÔNG nên dùng LLM: bài toán có đáp án xác định mà code làm được (tính tiền, kiểm tra tồn kho, authorization). LLM chỉ nên đứng ở phần mơ hồ (hiểu ý, diễn đạt), còn quyết định và dữ kiện lấy từ code.

## 5. Cạm bẫy

- Ước lượng token bằng `strlen()/4`: sai nhiều, nhất là tiếng Việt. Dùng `usage`.
- Quên `max_tokens`, hoặc đặt quá nhỏ làm câu trả lời bị cắt (kiểm tra `stop_reason`).
- Tin rằng temperature 0 là deterministic, rồi viết test so sánh chuỗi.
- Coi context window là bộ nhớ dài hạn.
- Hard-code giá model trong code. Giá nằm trong config và có ngày cập nhật.

## 6. Tóm tắt

1. LLM sinh từng token theo probability; không có bước kiểm chứng sự thật nên hallucination là hệ quả cơ chế.
2. Tiền và thời gian đều tính theo token; output đắt và chậm hơn input; đếm bằng `usage`.
3. API không nhớ gì, mỗi lượt gửi lại toàn bộ context; chat dài tốn tăng nhanh.
4. Temperature thấp không bảo đảm deterministic; muốn ổn định hãy ép schema và kiểm bằng code.
5. Việc có đáp án xác định thì để code làm, LLM chỉ xử lý phần mơ hồ.

## 7. Câu hỏi tự kiểm tra

1. Vì sao chat 50 lượt tốn nhiều hơn nhiều so với 50 lần hỏi độc lập có cùng độ dài?
2. Temperature 0 có đảm bảo cùng input cho cùng output không? Nên làm gì khi cần ổn định?
3. Hãy tính chi phí một request 5.000 token input và 500 token output với giá $2/$10 mỗi triệu token.
4. Nêu hai nguyên nhân cơ chế gây hallucination và hai cách giảm.

<details><summary>Đáp án</summary>

1. API không có trạng thái nên mỗi lượt gửi lại toàn bộ history. Input lượt thứ n gồm n-1 lượt trước, tổng token input tăng gần như bậc hai theo số lượt. Prompt cache và cắt/tóm tắt history giúp giảm.
2. Không. Batching, tính toán số thực trên GPU và thay đổi phía server vẫn gây khác biệt; một số model còn không cho chỉnh temperature. Ép output theo schema, kiểm tra bằng code, và thiết kế test theo thuộc tính (ví dụ JSON hợp lệ, trường bắt buộc) thay vì so chuỗi.
3. 5.000 × 2 / 1.000.000 = $0,010; 500 × 10 / 1.000.000 = $0,005; tổng $0,015.
4. Ví dụ: mục tiêu training là sinh văn bản khả dĩ chứ không phải đúng; kiến thức bị nén và không có dữ kiện hiếm; knowledge cutoff. Giảm bằng RAG/tool lấy dữ kiện thật, bắt model gắn citation, cho phép "không biết", kiểm chứng bằng code.

</details>
