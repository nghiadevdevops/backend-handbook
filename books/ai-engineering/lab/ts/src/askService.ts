// Chương 11: ráp truy xuất + prompt + AgentLoop + kiểm tra trích nguồn.
import type Anthropic from "@anthropic-ai/sdk";
import pgvector from "pgvector";
import type { Db, User } from "./db.ts";

export interface Embedder {
  embed(text: string): Promise<number[]>;
}
export interface Runnable {
  run(system: string, messages: Anthropic.MessageParam[]): Promise<string>;
}
export interface AskDeps {
  db: Db;
  embedder: Embedder;
  loopForUser: (user: User) => Runnable;
  systemPrompt: string;
}
export interface Chunk {
  id: string;
  doc_id: number;
  content: string;
}
export interface AskOutput {
  content: Anthropic.TextBlockParam[];
  meta: { context_ids: string[]; citations_valid: boolean };
}

/** Escape để chunk không đóng được thẻ </doc> giả mạo (một lớp phòng thủ nhỏ). */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Retrieval: tenant lấy từ DB/session, không phải từ model. */
export async function retrieveChunks(
  db: Db,
  embedder: Embedder,
  tenantId: number,
  question: string,
  k = 5,
): Promise<Chunk[]> {
  const vec = await embedder.embed(question);
  const { rows } = await db.query<Chunk>(
    "SELECT id::text AS id, doc_id, content FROM kb_chunks WHERE tenant_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3",
    [tenantId, pgvector.toSql(vec), k],
  );
  return rows;
}

export class AskService {
  private readonly deps: AskDeps;

  constructor(deps: AskDeps) {
    this.deps = deps;
  }

  async answer(conversationId: number): Promise<AskOutput> {
    const { db } = this.deps;
    const conv = (
      await db.query<{ id: string; tenant_id: string; user_id: string }>(
        "SELECT id, tenant_id, user_id FROM conversations WHERE id = $1",
        [conversationId],
      )
    ).rows[0];
    if (!conv) throw new Error(`Không có conversation ${conversationId}`);
    const user: User = { id: Number(conv.user_id), tenantId: Number(conv.tenant_id) };

    // Lịch sử: 8 message done gần nhất, theo thứ tự cũ -> mới.
    const history = (
      await db.query<{ role: "user" | "assistant"; content: Anthropic.TextBlockParam[] }>(
        `SELECT role, content FROM (
           SELECT id, role, content FROM conversation_messages
           WHERE conversation_id = $1 AND status = 'done' ORDER BY id DESC LIMIT 8
         ) t ORDER BY id`,
        [conversationId],
      )
    ).rows;
    const last = history.at(-1);
    const question = (last?.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("");

    // 1. Retrieval (chương 5-7)
    const chunks = await retrieveChunks(db, this.deps.embedder, user.tenantId, question);

    // 2. Prompt (chương 3): phần ổn định ở system, retrieved chunks ở user
    const docs = chunks.map((c) => `<doc id="${c.id}">${escapeHtml(c.content)}</doc>`).join("\n");
    const messages: Anthropic.MessageParam[] = [
      ...history.slice(0, -1),
      { role: "user", content: `<tai_lieu>\n${docs}\n</tai_lieu>\nCâu hỏi: ${question}` },
    ];

    // 3. Gọi agent (chương 4): tool lookup_order gắn với user hiện tại (chương 9)
    const text = await this.deps.loopForUser(user).run(this.deps.systemPrompt, messages);

    // 4. Kiểm tra citation (chương 7)
    const ids = chunks.map((c) => c.id);
    const cited = [...text.matchAll(/\[doc:(\d+)\]/g)].map((m) => m[1]!);
    return {
      content: [{ type: "text", text }],
      meta: { context_ids: ids, citations_valid: cited.every((c) => ids.includes(c)) },
    };
  }
}
