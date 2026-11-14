// Chương 3: structured output với messages.parse + Zod. Cần API key để chạy thật.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const Triage = z.object({
  intent: z.enum(["hoi_don_hang", "doi_tra", "khieu_nai", "khac"]),
  order_id: z.string().nullable(),
  urgency: z.enum(["thap", "cao"]),
});

export async function triage(client: Anthropic, email: string) {
  const res = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 300,
    messages: [{ role: "user", content: email }],
    output_config: { format: zodOutputFormat(Triage) },
  });
  // Kiểm tra stop_reason: refusal hoặc max_tokens vẫn có thể cho output không khớp schema.
  if (res.stop_reason !== "end_turn") return null;
  return res.parsed_output; // null nếu không parse được: phải xử lý
}
