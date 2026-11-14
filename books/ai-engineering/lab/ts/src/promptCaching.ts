// Chương 3: prompt caching tự động bằng cache_control ở cấp cao nhất. Cần API key để chạy thật.
import Anthropic from "@anthropic-ai/sdk";

export async function askWithCache(client: Anthropic, stableSystem: string, question: string) {
  const res = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 1024,
    cache_control: { type: "ephemeral" }, // tự đặt breakpoint ở block cuối có thể cache
    system: stableSystem, // phần ổn định ở đầu prefix
    messages: [{ role: "user", content: question }], // phần thay đổi ở cuối
  });
  // Cả hai bằng 0 nghĩa là prefix không được cache (thường do quá ngắn).
  console.log({
    written: res.usage.cache_creation_input_tokens,
    read: res.usage.cache_read_input_tokens,
  });
  return res;
}
