// Kiểm tra logic AgentLoop với client GIẢ (kịch bản định sẵn), KHÔNG gọi API thật.
import type Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { AgentLoop, lookupOrderTool } from "./agentLoop.ts";

const seen: Anthropic.MessageParam[][] = [];
const script = [
  { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "lookup_order", input: { order_id: "A1029" } }] },
  { stop_reason: "end_turn", content: [{ type: "text", text: "Đơn A1029 đã giao." }] },
];
const fake = {
  messages: {
    create: async (p: { messages: Anthropic.MessageParam[] }) => {
      seen.push(structuredClone(p.messages));
      return script[seen.length - 1];
    },
  },
} as unknown as Pick<Anthropic, "messages">;

const loop = new AgentLoop({
  tools: [lookupOrderTool],
  handlers: { lookup_order: async (i) => JSON.stringify({ code: i.order_id, status: "shipped" }) },
  client: fake,
});
const out = await loop.run("sys", [{ role: "user", content: "Đơn A1029 đâu?" }]);
assert.equal(out, "Đơn A1029 đã giao.");
const second = seen[1]!;
const lastMsg = second.at(-1)!;
assert.equal(lastMsg.role, "user");
assert.equal((lastMsg.content as Anthropic.ToolResultBlockParam[])[0]!.tool_use_id, "tu_1");

// Tool lỗi -> is_error, và vòng lặp dừng ở maxSteps nếu model cứ gọi tool.
const endless = {
  messages: { create: async () => script[0] },
} as unknown as Pick<Anthropic, "messages">;
const stuck = await new AgentLoop({
  tools: [lookupOrderTool],
  handlers: { lookup_order: async () => { throw new Error("db down"); } },
  maxSteps: 3,
  client: endless,
}).run("sys", [{ role: "user", content: "?" }]);
assert.equal(stuck, "Không hoàn thành trong số bước cho phép.");
console.log("AgentLoop (client giả): OK");
