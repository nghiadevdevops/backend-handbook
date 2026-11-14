// Chương 11. POST /ask bằng node:http. Xác thực và rate limit (ví dụ 20 request/phút) đặt ở middleware hoặc reverse proxy.
import { createServer, type IncomingMessage, type Server } from "node:http";
import { z } from "zod";
import type { Db, User } from "./db.ts";

export interface AskQueue {
  add(name: "ask", data: { conversationId: number; pendingMessageId: number }): Promise<unknown>;
}
export interface ControllerDeps {
  db: Db;
  queue: AskQueue;
  authenticate: (req: IncomingMessage) => Promise<User | null>; // quyền lấy từ session, không từ body
}

const Body = z.object({
  question: z.string().min(1).max(4000), // input length cap
  conversation_id: z.number().int().optional(),
});

async function readJson(req: IncomingMessage, limit = 16_384): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("body quá lớn");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createAskServer({ db, queue, authenticate }: ControllerDeps): Server {
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    };
    try {
      if (req.method !== "POST" || req.url !== "/ask") return send(404, { error: "not found" });
      const user = await authenticate(req);
      if (!user) return send(401, { error: "unauthenticated" });
      const parsed = Body.safeParse(await readJson(req));
      if (!parsed.success) return send(422, { error: parsed.error.issues });
      const { question, conversation_id } = parsed.data;

      let convId: number;
      if (conversation_id !== undefined) {
        // Filter theo user_id: không dùng conversation_id của người khác.
        const r = await db.query<{ id: string }>("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [
          conversation_id,
          user.id,
        ]);
        if (!r.rows[0]) return send(404, { error: "not found" });
        convId = conversation_id;
      } else {
        const r = await db.query<{ id: string }>(
          "INSERT INTO conversations (tenant_id, user_id) VALUES ($1, $2) RETURNING id",
          [user.tenantId, user.id],
        );
        convId = Number(r.rows[0]!.id);
      }

      await db.query("INSERT INTO conversation_messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [
        convId,
        JSON.stringify([{ type: "text", text: question }]),
      ]);
      const pending = await db.query<{ id: string }>(
        "INSERT INTO conversation_messages (conversation_id, role, content, status) VALUES ($1, 'assistant', '[]', 'pending') RETURNING id",
        [convId],
      );
      const messageId = Number(pending.rows[0]!.id);

      await queue.add("ask", { conversationId: convId, pendingMessageId: messageId });
      return send(202, { message_id: messageId });
    } catch (e) {
      console.error(e);
      return send(500, { error: "internal" });
    }
  });
}
