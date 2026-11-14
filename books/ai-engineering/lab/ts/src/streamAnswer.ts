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
