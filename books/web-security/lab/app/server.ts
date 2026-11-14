// LAB ONLY: ứng dụng CỐ TÌNH có lỗi (/vuln/*) kèm bản đã sửa (/fixed/*).
// Không bao giờ deploy ra ngoài. Chạy trong docker network nội bộ, không map port.
// Node 26 chạy thẳng file .ts (type stripping), nên chỉ dùng cú pháp "erasable".
import express from "express";
import type { Request, Response } from "express";
import helmet from "helmet";
import pg from "pg";
import { z } from "zod";

const pool = new pg.Pool({
  host: process.env.PGHOST ?? "bookcheck-sec-db",
  user: "postgres",
  password: process.env.PGPASSWORD ?? "lab-only",
  database: "postgres",
});

async function seed(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try { await pool.query("SELECT 1"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, name TEXT, email TEXT, token TEXT, password_hash TEXT, is_admin INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS books(id SERIAL PRIMARY KEY, title TEXT, price INTEGER);
    CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, user_id INTEGER, book_id INTEGER, note TEXT);
    CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY, body TEXT);`);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  if (rows[0].c > 0) return;
  await pool.query(`
    INSERT INTO users(name,email,token,password_hash,is_admin) VALUES
      ('alice','alice@shop.test','tok-alice','HASH-ALICE-SECRET',0),
      ('bob','bob@shop.test','tok-bob','HASH-BOB-SECRET',0),
      ('root','root@shop.test','tok-root','HASH-ROOT-SECRET',1);
    INSERT INTO books(title,price) VALUES ('Clean Architecture',30),('Designing Data-Intensive Applications',45),('The Web Application Hacker''s Handbook',40);
    INSERT INTO orders(user_id,book_id,note) VALUES (1,1,'giao gio hanh chinh (alice)'),(2,2,'DIA CHI RIENG CUA BOB');`);
}

type User = { id: number; name: string; email: string; token: string; password_hash: string; is_admin: number };

async function currentUser(req: Request): Promise<User | null> {
  const m = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
  if (!m) return null;
  const { rows } = await pool.query("SELECT * FROM users WHERE token = $1", [m[1]]);
  return rows[0] ?? null;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ---------- 1. SQL injection ----------
app.get("/vuln/books", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "");
  try {
    // LỖI: nối chuỗi trực tiếp
    const { rows } = await pool.query(`SELECT id, title, price FROM books WHERE title LIKE '%${q}%'`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message }); // LỖI: lộ chi tiết SQL
  }
});
app.get("/fixed/books", async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "");
  const { rows } = await pool.query("SELECT id, title, price FROM books WHERE title LIKE $1", [`%${q}%`]);
  res.json(rows);
});

// ---------- 2. Stored XSS ----------
const csp = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"], scriptSrc: ["'self'"], objectSrc: ["'none'"],
      baseUri: ["'none'"], frameAncestors: ["'none'"],
    },
  },
});
for (const kind of ["vuln", "fixed"] as const) {
  const fixed = kind === "fixed";
  const guard = fixed ? csp : (_q: Request, _s: Response, next: () => void) => next(); // Lớp 2: CSP chỉ ở bản fixed
  app.post(`/${kind}/comments`, async (req: Request, res: Response) => {
    await pool.query("INSERT INTO comments(body) VALUES ($1)", [String(req.body?.body ?? "")]);
    res.status(201).json({ ok: true });
  });
  app.get(`/${kind}/comments`, guard, async (_req: Request, res: Response) => {
    const { rows } = await pool.query("SELECT body FROM comments ORDER BY id");
    // LỖI: in thô. ĐÃ SỬA: encode theo ngữ cảnh HTML
    const items = rows.map((r) => `<li>${fixed ? escapeHtml(r.body) : r.body}</li>`).join("");
    res.type("html").send(`<!doctype html><html><body><h1>Binh luan</h1><ul>${items}</ul></body></html>`);
  });
}

// ---------- 3. IDOR / BOLA ----------
app.get("/vuln/orders/:id", async (req: Request, res: Response) => {
  if (!(await currentUser(req))) return res.status(401).json({ error: "unauthenticated" });
  // LỖI: đã đăng nhập nhưng không kiểm tra order thuộc về ai
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});
app.get("/fixed/orders/:id", async (req: Request, res: Response) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });
  // ĐÃ SỬA: scope truy vấn theo chủ sở hữu (admin xem được tất cả); 404 để không lộ sự tồn tại
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE id = $1 AND ($3 = 1 OR user_id = $2)",
    [req.params.id, user.id, user.is_admin],
  );
  if (!rows[0]) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

// ---------- 4. Mass assignment ----------
const publicUser = "id, name, email, is_admin";
app.post("/vuln/profile", async (req: Request, res: Response) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });
  // LỖI: gán mọi field client gửi (kể cả is_admin). Tên cột đã lọc bằng regex nên không SQLi, nhưng vẫn gán được quyền.
  const entries = Object.entries(req.body ?? {}).filter(([k]) => /^[a-z_]+$/.test(k) && k !== "id");
  if (!entries.length) return res.status(422).json({ error: "nothing to update" });
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const { rows } = await pool.query(
    `UPDATE users SET ${sets} WHERE id = $${entries.length + 1} RETURNING ${publicUser}`,
    [...entries.map(([, v]) => v), user.id],
  );
  res.json(rows[0]);
});
const ProfileInput = z.strictObject({ name: z.string().min(1).max(100).optional(), email: z.email().optional() });
app.post("/fixed/profile", async (req: Request, res: Response) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "unauthenticated" });
  // ĐÃ SỬA: schema allowlist, field lạ bị từ chối (strictObject); gán tường minh từng cột
  const parsed = ProfileInput.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({ error: "invalid input", issues: parsed.error.issues.map((i) => ({ code: i.code, path: i.path, message: i.message })) });
  }
  const { rows } = await pool.query(
    `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING ${publicUser}`,
    [parsed.data.name ?? null, parsed.data.email ?? null, user.id],
  );
  res.json(rows[0]);
});
app.get("/admin/secret", async (req: Request, res: Response) => {
  const user = await currentUser(req);
  if (!user || !user.is_admin) return res.status(403).json({ error: "forbidden" });
  res.json({ secret: "du lieu chi danh cho admin" });
});

// ---------- 5. Prototype pollution ----------
type Json = { [k: string]: unknown };
// LỖI: deep merge đệ quy không chặn "__proto__"
function mergeUnsafe(target: Json, src: Json): Json {
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === "object") target[k] = mergeUnsafe((target[k] ?? {}) as Json, v as Json);
    else target[k] = v;
  }
  return target;
}
const Settings = z.strictObject({ theme: z.enum(["light", "dark"]).optional(), lang: z.enum(["vi", "en"]).optional() });
app.post("/vuln/settings", (req: Request, res: Response) => {
  res.json(mergeUnsafe({ theme: "light", lang: "vi" }, req.body ?? {}));
});
app.post("/fixed/settings", (req: Request, res: Response) => {
  // ĐÃ SỬA: validate schema trước khi merge; chỉ merge field đã biết
  const parsed = Settings.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: "invalid input", codes: parsed.error.issues.map((i) => i.code) });
  res.json({ theme: "light", lang: "vi", ...parsed.data });
});
// Kiểm tra kiểu "legacy": object rỗng mới tạo, đọc cờ isAdmin.
// Sau khi Object.prototype bị ô nhiễm, mọi object đều "có" cờ đó.
app.get("/legacy/panel", (_req: Request, res: Response) => {
  const flags: Json = {};
  if (flags.isAdmin) return res.json({ panel: "ADMIN PANEL (khong can dang nhap)" });
  res.status(403).json({ error: "forbidden" });
});

app.use((_req: Request, res: Response) => res.status(404).json({ error: "not found" }));
// Express 5 chuyển lỗi của handler async vào đây
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  console.error(err.message);
  res.status(500).json({ error: "internal error" });
});

await seed();
app.listen(8080, "0.0.0.0", () => console.log("listening :8080"));
