// Chạy thật với PostgreSQL + pgvector (biến môi trường DATABASE_URL). Không cần API key:
// embedding và hàng đợi là bản giả; truy vấn vector, tool lookup_order và POST /ask chạy thật.
import assert from "node:assert/strict";
import pg from "pg";
import pgvector from "pgvector/pg";
import { retrieveChunks } from "./askService.ts";
import { lookupOrderHandler } from "./lookupOrderHandler.ts";
import { createAskServer } from "./askController.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
// pgvector/pg: đăng ký type để cột vector đọc ra là number[] (với pool: dùng onConnect)
await pgvector.registerTypes(client);

// 1. Truy vấn vector, có filter tenant
const embedder = { embed: async () => [0.9, 0.1, 0] };
const t1 = await retrieveChunks(client, embedder, 1, "đổi trả?", 2);
console.log("tenant 1:", t1.map((c) => `${c.id}:${c.content}`));
assert.deepEqual(t1.map((c) => c.id), ["1", "3"]);
const t2 = await retrieveChunks(client, embedder, 2, "đổi trả?", 5);
assert.deepEqual(t2.map((c) => c.id), ["4"]); // không bao giờ thấy chunk của tenant khác

// 2. Tool lookup_order với authorization theo tenant
const h1 = lookupOrderHandler(client, { id: 10, tenantId: 1 });
console.log(await h1({ order_id: "A1029" }));
assert.match(await h1({ order_id: "A1029" }), /shipped/);
assert.match(await h1({ order_id: "A2000" }), /Không tìm thấy/); // đơn của tenant 2
assert.match(await h1({ order_id: "A1029'; DROP TABLE orders;--" }), /không hợp lệ/);

// 3. POST /ask thật với queue giả
const jobs: unknown[] = [];
const server = createAskServer({
  db: client,
  queue: { add: async (_n, d) => void jobs.push(d) },
  authenticate: async (req) =>
    req.headers.authorization === "Bearer u10" ? { id: 10, tenantId: 1 }
    : req.headers.authorization === "Bearer u11" ? { id: 11, tenantId: 1 } : null,
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const post = (auth: string | null, body: unknown) =>
  fetch(base + "/ask", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

assert.equal((await post(null, { question: "x" })).status, 401);
assert.equal((await post("Bearer u10", { question: "x".repeat(4001) })).status, 422);
const r = await post("Bearer u10", { question: "Chính sách đổi trả?" });
assert.equal(r.status, 202);
const { message_id } = (await r.json()) as { message_id: number };
console.log("202, message_id =", message_id, "jobs =", JSON.stringify(jobs));
const conv = (await client.query("SELECT conversation_id FROM conversation_messages WHERE id = $1", [message_id])).rows[0];
// user khác (u11) dùng conversation_id của u10 phải nhận 404
assert.equal((await post("Bearer u11", { question: "x", conversation_id: Number(conv.conversation_id) })).status, 404);
assert.equal((await post("Bearer u10", { question: "tiếp", conversation_id: Number(conv.conversation_id) })).status, 202);

server.close();
client.release();
await pool.end();
console.log("pgvector + lookup_order + POST /ask: OK");
