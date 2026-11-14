// Chương 4. Vòng lặp agent bằng @anthropic-ai/sdk. Cần API key để chạy thật (client đọc ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import type { ToolHandler } from "./lookupOrderHandler.ts";

export const lookupOrderTool: Anthropic.Tool = {
  name: "lookup_order",
  description:
    "Tra trạng thái một đơn hàng theo mã đơn (dạng A1029). Chỉ dùng khi người hỏi nêu rõ mã đơn. Không dùng để tìm đơn theo tên khách.",
  input_schema: {
    type: "object",
    properties: { order_id: { type: "string", description: "Mã đơn, ví dụ A1029" } },
    required: ["order_id"],
    additionalProperties: false,
  },
};

export interface AgentLoopOptions {
  tools: Anthropic.Tool[];
  handlers: Record<string, ToolHandler>;
  model?: string;
  maxSteps?: number; // chặn infinite loop
  // SDK đã tự retry lỗi tạm thời (mặc định 2 lần); timeout tính bằng ms.
  client?: Pick<Anthropic, "messages">;
}

export class AgentLoop {
  private readonly client: Pick<Anthropic, "messages">;
  private readonly model: string;
  private readonly maxSteps: number;

  private readonly opts: AgentLoopOptions;

  constructor(opts: AgentLoopOptions) {
    this.opts = opts;
    this.client = opts.client ?? new Anthropic({ timeout: 60_000, maxRetries: 2 });
    this.model = opts.model ?? "claude-sonnet-5-5";
    this.maxSteps = opts.maxSteps ?? 6;
  }

  async run(system: string, history: Anthropic.MessageParam[]): Promise<string> {
    const messages = [...history];
    for (let step = 0; step < this.maxSteps; step++) {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system,
        tools: this.opts.tools,
        messages,
      });

      // Lưu nguyên content block (kể cả thinking nếu có) trước khi trả tool_result.
      messages.push({ role: "assistant", content: res.content });

      if (res.stop_reason !== "tool_use") {
        return res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const handler = this.opts.handlers[block.name];
        try {
          const out = handler
            ? await handler(block.input as Record<string, unknown>)
            : "Tool không tồn tại.";
          results.push({ type: "tool_result", tool_use_id: block.id, content: out, is_error: !handler });
        } catch (e) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Lỗi khi chạy tool: " + (e instanceof Error ? e.message : String(e)),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return "Không hoàn thành trong số bước cho phép.";
  }
}
