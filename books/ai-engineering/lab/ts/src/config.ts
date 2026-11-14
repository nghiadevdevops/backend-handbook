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
