# Chương 8. Evals: đo chất lượng thay vì cảm giác

## 1. Tình huống

Bạn sửa một dòng trong system prompt để câu trả lời "thân thiện hơn". Ba ca bạn thử tay trông tốt hơn, bạn deploy. Hai ngày sau, ticket báo rằng trợ lý đã ngừng gắn citation ở các câu hỏi về hoàn tiền. Không ai nhận ra vì không có gì đo. Với phần mềm thông thường bạn có unit test; với ứng dụng LLM, **eval** đóng vai trò đó, nhưng output không deterministic và thường không có một đáp án duy nhất nên cách làm khác.

## 2. Khái niệm

Eval = một tập tình huống (input kèm kỳ vọng) + cách scoring + quy trình chạy lặp lại để so sánh các phiên bản (prompt, model, tham số retrieval).

```
test set ──▶ run system (version X) ──▶ scoring ──▶ report
                                           │
        compare X with baseline  ◀─────────┘
```

### 2.1 Xây bộ test

- Bắt đầu nhỏ: **30 đến 50 ca thật** tốt hơn 1.000 ca tổng hợp lơ mơ. Lấy từ log thật (đã ẩn danh), ticket, câu hỏi nhân viên hay gặp.
- Phủ **ca khó và edge case**: câu mơ hồ, ngoài phạm vi (kỳ vọng "không biết"), thiếu thông tin, nhiều ngôn ngữ, cố tình tấn công (chương 9).
- Mỗi ca có: `id`, input, **tiêu chí** kỳ vọng (không nhất thiết là chuỗi đáp án đúng từng chữ), nhãn loại (`hoan_tien`, `ngoai_pham_vi`...).
- Khi production lộ lỗi mới, **thêm ca đó vào bộ test**. Bộ test lớn dần theo incident, như regression test.
- Tách tập **dev** (để chỉnh prompt) và tập **held-out** (chỉ xem định kỳ) để tránh overfitting vào bộ test.

Ví dụ định dạng JSONL của ShopAssist:

```json
{"id":"rf-001","type":"hoan_tien","input":"Khách mua hàng giảm 60% có đổi trả được không?","expect":{"must_cite":["12#4"],"must_say":["không được đổi trả"],"forbid":["được đổi trả trong 7 ngày"]}}
{"id":"oos-001","type":"ngoai_pham_vi","input":"Hôm nay giá vàng bao nhiêu?","expect":{"refuse":true}}
```

### 2.2 Ba loại scoring

1. **Chấm bằng code (ưu tiên số một).** Rẻ, nhanh, deterministic: JSON hợp lệ theo schema, có trích đúng `[doc:ID]` mong đợi, ID trích nằm trong tập đã cung cấp, độ dài, có keyword bắt buộc, không chứa chuỗi cấm, gọi đúng tool với đúng tham số. Đo riêng **retrieval**: chunk đúng có nằm trong top-k không (recall@k của chương 6-7).
2. **Chấm bằng LLM (LLM-as-judge).** Dùng một model đọc câu trả lời và rubric rồi cho điểm hoặc chọn tốt hơn. Dùng cho tiêu chí mềm: "đúng ý", "có căn cứ vào tài liệu" (grounding), "giọng điệu".
3. **Chấm bằng người.** Gold standard nhưng chậm và đắt; dùng để calibrate judge và xem mẫu ngẫu nhiên.

### 2.3 LLM-as-judge và giới hạn

Cách dùng tốt:
- Rubric **cụ thể, binary hoặc thang ngắn** ("Câu trả lời có khẳng định điều không có trong tài liệu? Có/Không") hơn là "cho điểm 1-10 chất lượng".
- Đưa judge **cả tài liệu nguồn** để kiểm tra grounding; yêu cầu nêu lý do trước rồi mới chấm.
- Dùng structured output (chương 3) để parse điểm.
- So sánh cặp (A và B, đảo thứ tự hai lần) thường ổn định hơn chấm điểm tuyệt đối.
- **Calibrate judge với người**: chấm tay 50 ca, đo mức agreement giữa judge và người. Chỉ tin judge ở mức đã đo.

Giới hạn đã biết (cần nhớ khi đọc kết quả):
- **Position bias**: judge có xu hướng thích đáp án đứng trước (hoặc sau).
- **Length bias**: câu dài, nhiều chữ thường được chấm cao hơn.
- **Self-preference bias**: judge có thể thích output của chính họ model đó hơn; nên dùng judge khác họ với model được đánh giá khi có thể.
- **Judge cũng hallucination** và cũng không deterministic.
- **Judge đổi phiên bản làm điểm drift**: pin phiên bản judge, ghi vào báo cáo.

Các bias này được ghi nhận trong nghiên cứu về LLM-as-a-judge; tôi không trích số liệu cụ thể vì chưa tra nguồn gốc trong lần viết này, bạn hãy đo mức độ bias trên chính dữ liệu của mình bằng cách đảo thứ tự và so với chấm tay.

Quy tắc: **judge để phát hiện degradation và ranking thô, không phải để phán quyết cuối**. Mọi quyết định lớn cần mẫu chấm tay.

### 2.4 Regression khi đổi prompt hoặc model

Mọi thay đổi (prompt, model, tham số retrieval, kích thước chunk, phiên bản embedding) phải chạy bộ eval và so với **baseline** đã lưu.

Quy trình gợi ý:
1. Chạy bộ test với phiên bản hiện tại, lưu kết quả theo từng ca làm baseline.
2. Chạy phiên bản mới. So **theo từng ca**, không chỉ trung bình: tập hợp những ca "từng đúng, nay sai" (regression) đáng đọc hơn một con số tổng.
3. Output không deterministic nên chạy mỗi ca nhiều lần (ví dụ 3 đến 5 lần) với ca quan trọng và nhìn tỷ lệ đạt, không phải một lần.
4. Đặt **gate**: ví dụ không có ca nhóm "an toàn" nào tụt, tỷ lệ đạt tổng không giảm quá một threshold bạn định trước, chi phí và p95 latency nằm trong ngân sách.
5. Tích hợp vào CI cho bộ test nhỏ nhanh (chấm bằng code), chạy bộ lớn (có judge) theo lịch hoặc trước release.

Với mẫu nhỏ, chênh lệch vài điểm phần trăm có thể chỉ là noise: 40 ca thì mỗi ca là 2,5 điểm phần trăm. Đừng ăn mừng 3 điểm cải thiện trên 40 ca.

Đổi model còn phải kiểm chi phí và độ dài output: tokenizer khác nhau làm cùng một prompt tốn số token khác nhau (chương 1-2).

### 2.5 Theo dõi trên production

Bộ test offline không bắt được mọi thứ. Trên production:
- **Log** mọi lượt: input (đã ẩn dữ liệu nhạy cảm), chunk retrieved, tool đã gọi, output, model và phiên bản prompt, token, latency (chương 10).
- **Feedback signal**: ngón tay lên/xuống, nhân viên sửa câu trả lời, tỷ lệ chuyển cho người, tỷ lệ "không biết".
- **Chấm mẫu ngẫu nhiên** (một phần trăm lượt) bằng judge và người, theo dõi theo thời gian để bắt drift (nhà cung cấp cập nhật, dữ liệu đổi).
- **Alert** theo chỉ số: tỷ lệ lỗi schema, tỷ lệ từ chối, tỷ lệ citation không hợp lệ, chi phí mỗi lượt.
- Đưa các lượt tệ vào bộ test.

## 3. Ví dụ: bộ chạy eval tối giản (TypeScript)

Đoạn mã dưới chấm bằng code (file `lab/ts/src/evalRunner.ts`); hàm `ask` gọi hệ thống thật cần API key để chạy. Runner đã chạy thật với hàm `ask` giả và bộ ca `lab/ts/data/eval.jsonl` (`lab/ts/src/demoEval.ts`): ca có một lần lặp trả sai cho `pass_rate` 0,67, ca còn lại 1,0. Chưa chạy với hệ thống thật vì không có API key.

```ts
// Chương 8. Chấm bằng code; hàm ask gọi hệ thống thật (cần API key) hoặc fake khi test.
import { readFile } from "node:fs/promises";

export interface AskResult {
  answer: string;
  cited: string[];
  contextIds: string[];
}
export type Ask = (input: string) => Promise<AskResult>;

interface Expect {
  must_cite?: string[];
  must_say?: string[];
  forbid?: string[];
}
interface EvalCase {
  id: string;
  type: string;
  input: string;
  expect: Expect;
}
export interface EvalRow {
  id: string;
  type: string;
  passRate: number;
}

export class EvalRunner {
  private readonly ask: Ask;

  constructor(ask: Ask) {
    this.ask = ask;
  }

  async run(jsonlPath: string, repeats = 3): Promise<EvalRow[]> {
    const lines = (await readFile(jsonlPath, "utf8")).split("\n").filter((l) => l.trim() !== "");
    const rows: EvalRow[] = [];
    for (const line of lines) {
      const c = JSON.parse(line) as EvalCase;
      let passes = 0;
      for (let i = 0; i < repeats; i++) {
        passes += this.check(c.expect, await this.ask(c.input)) ? 1 : 0;
      }
      rows.push({ id: c.id, type: c.type, passRate: passes / repeats });
    }
    return rows;
  }

  private check(e: Expect, r: AskResult): boolean {
    const a = r.answer.toLowerCase();
    for (const id of e.must_cite ?? []) if (!r.cited.includes(id)) return false;
    for (const id of r.cited) if (!r.contextIds.includes(id)) return false; // không được cite ID ngoài context
    for (const s of e.must_say ?? []) if (!a.includes(s.toLowerCase())) return false;
    for (const s of e.forbid ?? []) if (a.includes(s.toLowerCase())) return false;
    return true;
  }
}
```

## 4. Trade-off

| Phương pháp | Tốt ở | Yếu ở |
|---|---|---|
| Code | rẻ, deterministic, chạy CI | không đo được "hay/đúng ý" |
| LLM judge | tiêu chí mềm, quy mô lớn | bias, tốn tiền, cần calibrate |
| Người | gold standard | chậm, đắt, không lặp lại được |

Khi **không** cần eval nặng: prototype vứt đi, hoặc chức năng rủi ro thấp. Nhưng ngay khi có người dùng thật, hãy có tối thiểu bộ chấm bằng code và 30 ca.

## 5. Cạm bẫy

- Chỉnh prompt cho đúng bộ test rồi báo cáo con số trên chính bộ test đó (overfitting).
- Tin con số trung bình, bỏ qua regression theo từng ca.
- Để judge và model được đánh giá là cùng một model mà không calibrate.
- Chạy một lần duy nhất trên output không deterministic.
- Không pin phiên bản judge nên điểm drift theo thời gian.
- Bộ test không bao giờ cập nhật từ incident production.

## 6. Tóm tắt

1. Eval là test của hệ thống LLM: bộ ca thật + cách chấm + so với baseline.
2. Ưu tiên chấm bằng code; dùng LLM judge cho tiêu chí mềm và calibrate nó với chấm tay.
3. Judge có position bias, length bias, self-preference bias; đảo thứ tự và đo trên dữ liệu của bạn.
4. Mọi thay đổi prompt, model, chunking, embedding đều chạy eval; xem regression theo từng ca, chạy nhiều lần.
5. Trên production: log, feedback, chấm mẫu, alert; đưa lượt tệ vào bộ test.

## 7. Câu hỏi tự kiểm tra

1. Vì sao nên bắt đầu bằng 30 ca thật thay vì 1.000 ca tổng hợp?
2. Nêu hai bias của LLM-as-judge và một cách giảm.
3. Vì sao so sánh theo từng ca quan trọng hơn so sánh trung bình?
4. Bạn đổi model rẻ hơn, điểm tổng không đổi. Còn phải kiểm gì trước khi chuyển?

<details><summary>Đáp án</summary>

1. Ca thật phản ánh distribution và lỗi thực tế; ca tổng hợp lơ mơ dễ bỏ sót tình huống thật và tạo cảm giác an toàn giả. Có thể mở rộng dần.
2. Position bias (giảm bằng đảo thứ tự hai lần), length bias (giảm bằng rubric binary, kiểm soát độ dài). Cũng có self-preference bias (dùng judge khác họ).
3. Trung bình che regression: một số ca từng đúng nay sai bị bù bởi ca khác khá lên; danh sách ca regression cho biết lỗi cụ thể và có thể là ca an toàn quan trọng.
4. Regression theo ca (đặc biệt nhóm an toàn), chi phí thực tế mỗi tác vụ (tokenizer khác), p95 latency, tỷ lệ lỗi schema và từ chối, và chạy lặp để loại noise.

</details>
