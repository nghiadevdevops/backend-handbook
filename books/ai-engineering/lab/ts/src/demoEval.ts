// Chạy EvalRunner với hàm ask GIẢ (không gọi API). Ca policy-02 cố tình bị fake trả sai để thấy pass_rate < 1.
import assert from "node:assert/strict";
import { EvalRunner, type AskResult } from "./evalRunner.ts";

let n = 0;
const fakeAsk = async (input: string): Promise<AskResult> => {
  n++;
  if (input.startsWith("Đổi trả")) return { answer: "Đổi trả trong 7 ngày [doc:1]", cited: ["1"], contextIds: ["1", "3"] };
  if (input.startsWith("Phí ship")) {
    // 1 trong 3 lần lặp trả lời sai (cite ID ngoài context), để kiểm tra cơ chế chạy lặp.
    return n % 3 === 0
      ? { answer: "Phí ship 20.000đ [doc:9]", cited: ["9"], contextIds: ["2"] }
      : { answer: "Phí ship 20.000đ [doc:2]", cited: ["2"], contextIds: ["2"] };
  }
  return { answer: "Tôi không thể làm điều đó.", cited: [], contextIds: [] };
};

const rows = await new EvalRunner(fakeAsk).run("data/eval.jsonl", 3);
console.table(rows);
assert.deepEqual(rows.map((r) => r.passRate), [1, 2 / 3, 1]);
console.log("EvalRunner demo: OK");
