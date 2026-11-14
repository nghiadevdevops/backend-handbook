// Minimal orders API for the lab: idempotency key + ETag/If-Match + cursor pagination + RFC 9457.
// State lives in process memory. Node runs one event loop, so each synchronous
// read-modify-write block below is atomic. Production needs a DB with a unique constraint.
import { createHash } from "node:crypto";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Ajv } from "ajv";

type Item = { sku: string; quantity: number; unit_price: number };
type Order = {
  id: string; status: string; note: string | null; items: Item[];
  total: number; version: number; created_at: string;
};
type Stored = { status: number; body: unknown; headers: Record<string, string> };
type IdemEntry = { fp: string; state: "processing" | "done"; response?: Stored };

let seq = 0;
const orders = new Map<string, Order>();
const idem = new Map<string, IdemEntry>();

// Validation uses plain JSON Schema (same dialect as the OpenAPI spec) compiled by Ajv.
const ajv = new Ajv({ allErrors: true });
const validateCreate = ajv.compile({
  type: "object",
  required: ["items"],
  properties: {
    note: { type: ["string", "null"] },
    items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["sku", "quantity", "unit_price"],
        properties: {
          sku: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          unit_price: { type: "integer", minimum: 0 },
        },
      },
    },
  },
});
const messages: Record<string, string> = {
  sku: "sku bắt buộc",
  quantity: "quantity phải là số nguyên >= 1",
  unit_price: "unit_price phải là số nguyên >= 0",
};

const app = Fastify({ ignoreTrailingSlash: true });

// Keep the raw body: the idempotency fingerprint hashes the exact bytes the client sent.
const rawParser = (_req: FastifyRequest, body: string | Buffer, done: (e: Error | null, b?: unknown) => void) =>
  done(null, body);
app.addContentTypeParser("application/json", { parseAs: "string" }, rawParser);
app.addContentTypeParser("*", { parseAs: "string" }, rawParser);

function send(reply: FastifyReply, status: number, body: unknown, headers: Record<string, string> = {},
              type = "application/json") {
  reply.code(status).headers(headers);
  if (status === 422) reply.raw.statusMessage = "Unprocessable Content"; // RFC 9110 name; Node still says "Entity"
  if (body === null) return reply.send();
  return reply.type(type).send(JSON.stringify(body) + "\n");
}
function problem(req: FastifyRequest, reply: FastifyReply, status: number, slug: string, title: string,
                 detail: string, extra: object = {}, headers: Record<string, string> = {}) {
  return send(reply, status, {
    type: `https://api.example.com/problems/${slug}`, title, status, detail,
    instance: req.url.split("?")[0], ...extra,
  }, headers, "application/problem+json");
}
const repr = (o: Order) => ({
  id: o.id, status: o.status, note: o.note, items: o.items,
  total: o.total, version: o.version, created_at: o.created_at,
});
const etag = (o: Order) => `"${createHash("sha256").update(JSON.stringify(repr(o))).digest("hex").slice(0, 16)}"`;
const rawOf = (req: FastifyRequest) => (typeof req.body === "string" ? req.body : "");
function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const d: unknown = JSON.parse(raw);
    return d !== null && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  } catch { return null; }
}
const header = (req: FastifyRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};
const ID_RE = /^ord_\d{4}$/;
const pathOf = (req: FastifyRequest) => req.url.split("?")[0]!.replace(/\/+$/, "") || "/";

// ---------- POST /orders ----------
app.post("/orders", async (req, reply) => {
  const key = header(req, "idempotency-key");
  if (key === undefined) return problem(req, reply, 400, "idempotency-key-missing", "Thiếu Idempotency-Key", "POST /orders yêu cầu header Idempotency-Key.");
  const raw = rawOf(req);
  const fp = createHash("sha256").update(raw).digest("hex"); // production: canonicalize JSON before hashing

  // Step 1: reserve the key atomically (no await between get and set, so no interleaving)
  const e = idem.get(key);
  if (e) {
    if (e.fp !== fp) return problem(req, reply, 422, "idempotency-key-reused", "Idempotency-Key bị dùng lại", "Key này đã được dùng với payload khác.");
    if (e.state === "processing") return problem(req, reply, 409, "request-in-progress", "Request đang xử lý", "Request gốc với key này chưa xong; thử lại sau.", {}, { "Retry-After": "1" });
    const r = e.response!;
    return send(reply, r.status, r.body, { ...r.headers, "Idempotent-Replayed": "true" });
  }
  idem.set(key, { fp, state: "processing" });

  // Step 2: real work
  const delay = header(req, "x-demo-delay"); // demo only: hold the request to show the race
  if (delay) await new Promise((r) => setTimeout(r, parseInt(delay, 10) * 1000));
  const d = parseObject(raw);
  if (d === null) {
    idem.delete(key);
    return problem(req, reply, 400, "malformed-json", "JSON không hợp lệ", "Body không phải JSON object.");
  }
  if (!validateCreate(d)) {
    idem.delete(key); // release the key so the client can fix the body and retry with the same key
    const errors = (validateCreate.errors ?? []).map((er) => {
      const missing = er.keyword === "required" ? (er.params as { missingProperty: string }).missingProperty : "";
      const pointer = er.instancePath + (missing ? `/${missing}` : "");
      const field = pointer.split("/").pop() ?? "";
      let detail = messages[field] ?? er.message ?? "không hợp lệ";
      if (pointer === "/items") detail = "Phải có ít nhất 1 item";
      return { pointer, detail };
    });
    return problem(req, reply, 422, "validation-error", "Dữ liệu không hợp lệ", `Có ${errors.length} lỗi validation.`, { errors });
  }
  const body = d as { note?: string | null; items: Item[] };
  seq++;
  const id = `ord_${String(seq).padStart(4, "0")}`;
  const total = body.items.reduce((a, i) => a + i.quantity * i.unit_price, 0);
  const o: Order = { id, status: "pending", note: body.note ?? null, items: body.items, total, version: 1,
                     created_at: new Date().toISOString() };
  orders.set(id, o);
  const stored: Stored = { status: 201, body: repr(o), headers: { Location: `/orders/${id}`, ETag: etag(o) } };
  idem.set(key, { fp, state: "done", response: stored });
  return send(reply, stored.status, stored.body, stored.headers);
});

// ---------- GET /orders ----------
app.get("/orders", async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const limit = q.limit !== undefined ? parseInt(q.limit, 10) || 0 : 2;
  if (limit < 1 || limit > 100) return problem(req, reply, 400, "invalid-parameter", "Tham số không hợp lệ", "limit phải từ 1 đến 100.", { errors: [{ parameter: "limit", detail: "phải từ 1 đến 100" }] });
  let after: string | null = null;
  if (q.cursor !== undefined) {
    after = Buffer.from(String(q.cursor), "base64url").toString("utf8");
    if (!ID_RE.test(after)) return problem(req, reply, 400, "invalid-cursor", "Cursor không hợp lệ", "Cursor sai định dạng hoặc đã hết hạn.");
  }
  let rows = [...orders.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // keyset by id asc
  if (q.status !== undefined) rows = rows.filter((o) => o.status === q.status);
  if (after !== null) rows = rows.filter((o) => o.id > after!);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const next = hasMore ? Buffer.from(page[page.length - 1]!.id).toString("base64url") : null;
  return send(reply, 200, { data: page.map(repr), next_cursor: next });
});

// ---------- /orders/:id ----------
const notFoundOrder = (req: FastifyRequest, reply: FastifyReply, id: string) =>
  problem(req, reply, 404, "order-not-found", "Không tìm thấy order", `Order ${id} không tồn tại.`);
const notFound = (req: FastifyRequest, reply: FastifyReply) =>
  problem(req, reply, 404, "not-found", "Không tìm thấy", `Không có route ${req.method} ${pathOf(req)}.`);

app.get("/orders/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!ID_RE.test(id)) return notFound(req, reply);
  const o = orders.get(id);
  if (!o) return notFoundOrder(req, reply, id);
  const tag = etag(o);
  if (header(req, "if-none-match") === tag) return send(reply, 304, null, { ETag: tag });
  return send(reply, 200, repr(o), { ETag: tag, "Cache-Control": "private, max-age=0, must-revalidate" });
});

app.patch("/orders/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!ID_RE.test(id)) return notFound(req, reply);
  const o = orders.get(id);
  if (!o) return notFoundOrder(req, reply, id);
  const im = header(req, "if-match");
  if (im === undefined) return problem(req, reply, 428, "precondition-required", "Cần If-Match", "PATCH yêu cầu If-Match với ETag lấy từ GET gần nhất.");
  const d = parseObject(rawOf(req));
  if (d === null) return problem(req, reply, 400, "malformed-json", "JSON không hợp lệ", "Body không phải JSON object.");
  if (im !== "*" && im !== etag(o)) {
    return problem(req, reply, 412, "precondition-failed", "ETag không khớp", "Order đã bị thay đổi kể từ lần bạn đọc. GET lại rồi áp dụng thay đổi lên bản mới.", {}, { ETag: etag(o) });
  }
  if ("note" in d) o.note = d.note as string | null;
  o.version++;
  return send(reply, 200, repr(o), { ETag: etag(o) });
});

app.post("/orders/:id/cancel", async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!ID_RE.test(id)) return notFound(req, reply);
  const o = orders.get(id);
  if (!o) return notFoundOrder(req, reply, id);
  if (o.status === "cancelled") return send(reply, 200, repr(o), { ETag: etag(o) }); // naturally idempotent
  if (o.status !== "pending") return problem(req, reply, 409, "invalid-state", "Sai trạng thái", `Order ở trạng thái ${o.status} không thể hủy.`);
  o.status = "cancelled";
  o.version++;
  return send(reply, 200, repr(o), { ETag: etag(o) });
});

// ---------- fallbacks: 405 for known order paths, else 404 ----------
app.setNotFoundHandler((req, reply) => {
  const path = pathOf(req);
  const m = /^\/orders\/(ord_\d{4})(\/cancel)?$/.exec(path);
  if (m) {
    if (!orders.has(m[1]!)) return notFoundOrder(req, reply, m[1]!);
    return problem(req, reply, 405, "method-not-allowed", "Method không được hỗ trợ", `${req.method} không áp dụng cho ${path}.`, {}, { Allow: m[2] ? "POST" : "GET, PATCH" });
  }
  return notFound(req, reply);
});
app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  return problem(req, reply, 500, "internal-error", "Lỗi nội bộ", "Có lỗi không mong đợi.");
});

await app.listen({ host: "0.0.0.0", port: 8080 });
console.log("listening on 8080");
