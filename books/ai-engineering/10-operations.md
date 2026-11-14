# Chương 10. Vận hành: chi phí, cache, rate limit, fallback, streaming, observability

## 1. Tình huống

ShopAssist chạy ổn trong tuần đầu. Rồi: giờ cao điểm có 429, vài lần nhà cung cấp trả 5xx và trang CSKH treo 60 giây, hóa đơn tháng gấp ba dự kiến vì một khách hàng dán cả file log 200 nghìn token vào ô hỏi, và không ai biết vì sao một câu trả lời hôm qua sai vì không có log. Chương này là phần "đưa vào production".

## 2. Chi phí

### 2.1 Nắm được tiền đi đâu

Ghi **mỗi lượt gọi** vào bảng `llm_calls`: model, phiên bản prompt, input/output token, token đọc/ghi cache, latency, mã trạng thái, `user_id`, `tenant_id`, `feature`. Không có bảng này bạn không điều tối ưu được thứ gì.

```sql
CREATE TABLE llm_calls (
  id              bigserial PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       int,  user_id bigint,
  feature         text NOT NULL,           -- 'ask', 'classify', 'summarize'
  provider        text NOT NULL,  model text NOT NULL,
  prompt_version  text NOT NULL,
  input_tokens    int, output_tokens int,
  cache_read_tokens int, cache_write_tokens int,
  latency_ms      int, ttft_ms int,
  status          text NOT NULL,           -- ok | rate_limited | error | timeout
  request_id      text                     -- header request-id của nhà cung cấp để hỏi support
);
```

Dữ liệu `usage` lấy từ response (Anthropic: `usage.input_tokens`, `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`, tra 07/11/2026). Docs Anthropic cho biết mỗi response có header `request-id` và trường `request_id` trong body lỗi: hãy lưu để đưa cho support (SDK TypeScript đưa giá trị này ra qua thuộc tính `_request_id` của response).

### 2.2 Các lever giảm chi phí (theo thứ tự thường hiệu quả)

1. **Chọn đúng model theo tác vụ** (router nhỏ, chương 2).
2. **Prompt caching** cho phần prefix ổn định (chương 3): cache đọc rẻ hơn nhiều (bội số 0,05× đến 0,1× giá input tùy model theo docs Anthropic 07/11/2026).
3. **Cắt context**: ít chunk RAG hơn, tóm tắt history, bỏ trường thừa trong kết quả tool.
4. **Giới hạn output**: `max_tokens` hợp lý và instruction về độ dài.
5. **Batch API cho việc không gấp**: docs Anthropic ghi giảm 50% cho batch; hợp cho xử lý hàng loạt ban đêm (phân loại ticket cũ, embed lại kho). Không hợp cho chat tương tác.
6. **Cache ở application layer**: cùng câu hỏi cùng ngữ cảnh thì dùng lại câu trả lời (xem dưới).
7. **Budget và cap**: cap token mỗi request, mỗi người dùng mỗi ngày, mỗi tenant mỗi tháng; alert khi vượt.

### 2.3 Application-level cache

Hai loại, rủi ro khác nhau:
- **Exact cache**: key = hash(model + prompt_version + câu hỏi đã normalize + ID các chunk ngữ cảnh + `tenant_id`). Rẻ và an toàn. Câu trả lời phụ thuộc dữ liệu nên **key phải gồm phiên bản dữ liệu**, hoặc đặt TTL ngắn.
- **Semantic cache** (câu hỏi "gần giống" dùng lại câu trả lời): tiết kiệm hơn nhưng nguy hiểm, vì hai câu gần nhau về nghĩa có thể cần đáp án khác ("đổi trả trong 7 ngày?" và "trong 30 ngày?"). Nếu dùng, đặt threshold rất chặt, tách theo tenant/quyền, và đo sai số bằng eval. Không bao giờ chia sẻ cache giữa các tenant khi câu trả lời có dữ liệu riêng.

Cài đặt dưới (file `lab/ts/src/exactCache.ts`, chạy qua `tsc --noEmit`, chưa có test chạy riêng) dùng `Map` có TTL để không cần dịch vụ ngoài; production thường đặt cache trong Redis hoặc Valkey.

```ts
// Chương 10: exact cache (key gồm tenant và phiên bản prompt/dữ liệu). Store thật thường là Redis/Valkey;
// ở đây dùng Map có TTL để chạy được không cần dịch vụ ngoài.
import { createHash } from "node:crypto";

export interface Cache {
  get(key: string): string | undefined;
  set(key: string, value: string, ttlMs: number): void;
}

export class MemoryCache implements Cache {
  private readonly m = new Map<string, { v: string; exp: number }>();
  get(key: string): string | undefined {
    const e = this.m.get(key);
    if (!e || e.exp < Date.now()) return undefined;
    return e.v;
  }
  set(key: string, value: string, ttlMs: number): void {
    this.m.set(key, { v: value, exp: Date.now() + ttlMs });
  }
}

export function askCacheKey(tenantId: number, promptVersion: string, kbVersion: string, question: string): string {
  const raw = [tenantId, promptVersion, kbVersion, question.trim().toLowerCase()].join("|");
  return "ask:" + createHash("sha256").update(raw).digest("hex");
}

export async function cachedAnswer(
  cache: Cache,
  key: string,
  compute: () => Promise<string>,
  ttlMs = 30 * 60_000,
): Promise<string> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cache.set(key, value, ttlMs);
  return value;
}
```

## 3. Rate limit và transient error

Nhà cung cấp áp rate limit (số request và số token theo phút) và có lúc quá tải. Theo trang Errors của Anthropic (07/11/2026): 429 `rate_limit_error` là chạm giới hạn; 500 `api_error` là lỗi nội bộ nên retry với exponential backoff; 504 `timeout_error`; 529 `overloaded_error` là API quá tải tạm thời; có trường hợp 429 do tăng lưu lượng đột ngột ("acceleration limits") nên nên tăng tải từ từ; một 429 do chạm trần chi tiêu của gói **không có** header `retry-after` và sẽ lỗi liên tục cho tới khi hết chặn, nên không retry mù quáng. Khi có `retry-after`, hãy tôn trọng. SDK chính thức của Anthropic tự retry lỗi tạm thời hai lần mặc định với backoff và tôn trọng `retry-after`, theo docs (đổi bằng tùy chọn `maxRetries` ở constructor của client TypeScript).

Nguyên tắc:
- **Retry chỉ với lỗi tạm thời** (429 có retry-after, 5xx, timeout, mất kết nối), với **exponential backoff + jitter**, số lần hữu hạn. Không retry 400/401/403.
- Tách **connect timeout** và **total timeout**. Với phản hồi dài dùng streaming: docs Anthropic cảnh báo request dài mà không stream có thể bị mạng ngắt idle connection, và khuyên dùng streaming hoặc Batch API cho request kéo dài.
- **Giới hạn concurrency** phía bạn (semaphore/queue) để không tự gây 429.
- **Circuit breaker**: khi tỷ lệ lỗi vượt threshold, ngừng gọi một thời gian và chuyển sang fallback, tránh dồn thêm tải.
- **Idempotency**: nếu agent gọi tool có tác dụng phụ rồi lỗi mạng, retry có thể gây trùng; thiết kế tool có idempotency key.

## 4. Fallback

Nhiều bậc, từ ít đến nhiều phá vỡ trải nghiệm:
1. Retry cùng model.
2. Model dự phòng cùng nhà cung cấp (nhỏ hơn hoặc khác dòng).
3. Nhà cung cấp khác (cấu hình `fallback` ở chương 2). Cần test thật vì khác schema tool, caching, giới hạn tham số.
4. Degraded mode: hiển thị kết quả tìm kiếm thô (chương 7) thay vì câu trả lời sinh; hoặc "thử lại sau" kèm queue.

Hai bẫy: fallback sang model chưa qua eval có thể trả lời tệ hơn mà không ai biết; và các tham số riêng từng model (ví dụ docs Anthropic nêu một số model từ chối `tool_choice` ép buộc, từ chối prefill assistant, hay không cho tắt thinking) có thể khiến cùng một request chạy được ở model này và lỗi 400 ở model kia. Hãy chạy bộ eval cho cả đường fallback.

## 5. Streaming

Streaming trả token dần qua SSE (Server-Sent Events), giảm cảm giác chờ vì người dùng thấy chữ đầu tiên sau TTFT thay vì chờ cả câu. Lưu ý:
- Lỗi có thể xảy ra **giữa stream** dù HTTP đã trả 200 (docs Anthropic nêu "error events" trong stream). Phải xử lý sự kiện lỗi, không chỉ mã HTTP.
- Với tool calling, tham số tool đến dưới dạng JSON từng phần; chỉ parse khi block kết thúc.
- Moderation/kiểm tra output (ví dụ chặn URL lạ, chương 9) khó hơn khi đã hiển thị: quyết định kiểm trên stream hay buffer một đoạn.
- Cần proxy/web server không buffering: tắt buffering (Nginx `proxy_buffering off` / header `X-Accel-Buffering: no`). Trong Node.js, ghi response bằng `res.write()` với header `content-type: text/event-stream` (hoặc dùng `Readable.toWeb`/`Response` với `ReadableStream` ở framework dùng Web API) và đừng bật compression middleware cho route SSE, vì nó có thể gom chunk.
- Node.js xử lý I/O bất đồng bộ nên mỗi kết nối streaming không chiếm một worker như mô hình process-per-request, nhưng vẫn chiếm một socket và bộ nhớ cho tới khi xong; với lưu lượng cao cần giới hạn số kết nối đồng thời, xử lý client ngắt kết nối (hủy request tới nhà cung cấp để khỏi tốn token) và cân nhắc tách dịch vụ.

Đoạn mã dưới dùng `client.messages.stream()` của SDK và chuyển từng đoạn text cho một callback (file `lab/ts/src/streamAnswer.ts`). Cần API key để chạy thật nên mới chỉ qua `tsc --noEmit`; trong thực tế callback sẽ ghi SSE hoặc publish qua pub/sub.

```ts
// Chương 10, 11: streaming từ model, chuyển từng đoạn text cho callback (ví dụ ghi SSE hoặc publish qua pub/sub).
// Cần API key để chạy thật.
import Anthropic from "@anthropic-ai/sdk";

export async function streamAnswer(
  client: Anthropic,
  system: string,
  messages: Anthropic.MessageParam[],
  onText: (delta: string) => void,
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    system,
    messages,
  });
  stream.on("text", onText);
  // finalMessage() reject nếu stream gặp lỗi (kể cả error event giữa stream dù HTTP đã trả 200).
  return stream.finalMessage();
}
```

## 6. Observability

Cần trả lời được: lượt này đã gửi gì, retrieve chunk nào, gọi tool nào, model nào, tốn bao nhiêu, mất bao lâu, kết quả ra sao.

**Trace** một lượt hỏi gồm các span: nhận request → retrieval (embed query, SQL vector, rerank) → từng lần gọi model → từng lần chạy tool → kiểm tra output. Mỗi lần gọi model là một span con kèm model, token, finish reason.

**OpenTelemetry GenAI semantic conventions**: kiểm tra ngày 07/11/2026, các quy ước GenAI đã chuyển sang repo riêng `open-telemetry/semantic-conventions-genai` và trang spans mang nhãn **Development**, tức **chưa ổn định**; tên thuộc tính còn có thể đổi. Những gì tôi đã đọc trực tiếp trên trang đó: tên thuộc tính `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.response.id`, `gen_ai.response.finish_reasons`, `gen_ai.response.model`, và biến môi trường `OTEL_INSTRUMENTATION_GENAI_CAPTURE_CONTENT` (mặc định `NO_CONTENT`: nội dung prompt/response **không** bị ghi trừ khi bạn bật). Tên các thuộc tính đếm token và model yêu cầu nằm ở trang "Client Inference" mà tôi chưa đọc được nên **chưa xác minh**; hãy tra trực tiếp trước khi dựa vào chúng cho dashboard.

Hệ quả thực tế: dùng thư viện instrumentation chính thức cập nhật theo spec thay vì tự đặt tên, và giữ bảng `llm_calls` của bạn làm source of truth cho chi phí (độc lập với việc quy ước OTel đổi tên). Với dữ liệu nhạy cảm: giữ mặc định không ghi nội dung, bật có chủ đích và có che dữ liệu.

**Chỉ số nên có** (trên bảng `llm_calls` hoặc metrics):
- Chi phí: theo ngày, tenant, feature, model; chi phí mỗi tác vụ.
- Latency: p50/p95/p99 tổng và TTFT.
- Chất lượng: tỷ lệ lỗi schema, từ chối, "không biết", citation không hợp lệ, negative feedback, tỷ lệ chuyển cho người.
- Health: tỷ lệ 429/5xx/timeout, cache hit rate, queue depth.
- Alert: chi phí bất thường theo giờ, vòng lặp agent chạm `maxSteps`, một người dùng dùng quá threshold.

Privacy: nội dung prompt chứa dữ liệu khách; có chính sách lưu, che, và quyền xem (chương 9).

## 7. Trade-off

| Quyết định | Được | Mất |
|---|---|---|
| Streaming | cảm giác nhanh | phức tạp, giữ kết nối, moderation khó |
| Semantic cache | rẻ | nguy cơ trả sai ngữ cảnh |
| Fallback đa nhà cung cấp | bền | phải test và duy trì hai đường |
| Batch | rẻ | latency cao, không tương tác |
| Log nội dung đầy đủ | debug tốt | rủi ro dữ liệu, compliance |

## 8. Cạm bẫy

- Retry vô hạn hoặc không jitter làm bão retry khi nhà cung cấp quá tải.
- Không có trần token mỗi request nên một input khổng lồ đốt tiền.
- Cache câu trả lời mà key thiếu `tenant_id` hoặc phiên bản dữ liệu.
- Streaming qua proxy có buffering nên người dùng vẫn chờ cả câu.
- Chỉ log câu trả lời cuối, không log chunk retrieved và tool đã gọi.
- Dựa vào tên thuộc tính OTel GenAI cố định khi spec vẫn ở trạng thái Development.
- Tự xây dashboard chi phí mà dùng giá cũ hard-code.

## 9. Tóm tắt

1. Ghi mọi lượt gọi (model, token, cache, latency, request-id) vào một bảng; đó là nền của kiểm soát chi phí.
2. Giảm chi phí theo thứ tự: chọn model, prompt caching, cắt context, giới hạn output, batch, application cache, budget cap.
3. Retry chỉ lỗi tạm thời, có backoff và jitter; tôn trọng `retry-after`; có circuit breaker và fallback đã qua eval.
4. Streaming cải thiện cảm giác chờ nhưng phải xử lý lỗi giữa stream và buffering của proxy.
5. OTel GenAI semantic conventions đang ở trạng thái Development (07/11/2026): dùng nhưng đừng đóng đinh tên thuộc tính; mặc định không ghi nội dung.

## 10. Câu hỏi tự kiểm tra

1. Vì sao cache key ở application layer phải gồm `tenant_id` và phiên bản dữ liệu?
2. Phân biệt khi nào nên retry và không nên retry theo mã trạng thái.
3. Hóa đơn tăng đột biến. Bạn tra bảng `llm_calls` theo những chiều nào đầu tiên?
4. Streaming trả HTTP 200 rồi giữa chừng lỗi. Cần xử lý gì khác với request thường?

<details><summary>Đáp án</summary>

1. Câu trả lời phụ thuộc dữ liệu riêng của tenant và nội dung kho; thiếu tenant gây cross-tenant leakage, thiếu phiên bản dữ liệu gây trả thông tin cũ.
2. Retry: 429 có `retry-after`, 5xx, timeout, mất kết nối (backoff + jitter, số lần hữu hạn). Không retry: 400/401/403, và 429 do chạm trần chi tiêu không có `retry-after`.
3. Theo `feature`, `tenant_id`/`user_id`, `model`, `prompt_version`, rồi theo ngày/giờ; xem input_tokens lớn bất thường, cache_read thấp bất thường, số bước agent.
4. Xử lý sự kiện lỗi trong stream (không chỉ mã HTTP), giữ phần đã nhận hợp lý, thông báo cho người dùng, và ghi log trạng thái cuối.

</details>
