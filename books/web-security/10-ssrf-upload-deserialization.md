# Chapter 10. SSRF, Path Traversal, Upload, Deserialization, Mass Assignment, Prototype Pollution

## 1. The problem

Chương này gom các lỗi mà dữ liệu từ client điều khiển **resource phía server**: URL server sẽ gọi (SSRF), đường dẫn file server sẽ mở (path traversal, upload), dữ liệu server sẽ dựng lại thành object (deserialization), các trường server sẽ gán vào model (mass assignment), và cấu trúc object của chính runtime JavaScript (prototype pollution). Điểm chung: server tin quá nhiều vào thứ client đưa.

## 2. SSRF (Server-Side Request Forgery)

Tính năng "nhập URL ảnh đại diện", "preview link", webhook, import từ URL: server **tự gọi HTTP** tới URL do user đưa. Attacker trỏ URL vào chỗ mà chỉ server mới tới được:

- `http://169.254.169.254/latest/meta-data/` (metadata của cloud; với AWS IMDSv1 trả credential của instance)
- `http://localhost:6379` (Redis nội bộ), `http://internal-admin/` (internal service)
- `file:///etc/passwd`, `gopher://` (nếu client HTTP hỗ trợ scheme lạ)

Năm 2025 SSRF (CWE-918) nằm trong A01 Broken Access Control của OWASP Top 10:2025.

### Defenses

1. **Tránh** nếu được: cho chọn từ danh sách đã định, hoặc để client tự tải.
2. **Allowlist** host/scheme: chỉ `https`, chỉ domain đối tác biết trước.
3. Nếu bắt buộc nhận URL tùy ý: resolve DNS rồi **kiểm tra IP đích không thuộc dải riêng/loopback/link-local** (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`...), rồi **kết nối tới đúng IP đã kiểm tra** (chống DNS rebinding: kiểm tra xong nhưng lúc gọi DNS trả IP khác).
4. **Tắt/giới hạn redirect** (redirect có thể đưa tới IP nội bộ); kiểm tra lại mỗi chặng.
5. Giới hạn timeout, kích thước response, content-type; **không trả nội dung thô** về client.
6. Infrastructure layer: chạy worker tải URL trong network tách biệt, egress firewall; cloud: bắt buộc IMDSv2, hạn chế quyền IAM (least privilege).

Cạm bẫy: kiểm tra bằng regex chuỗi hostname (`http://evil.com@127.0.0.1/`, `http://2130706433/` là dạng số thập phân của 127.0.0.1, IPv6, `localtest.me` trỏ về 127.0.0.1). Chỉ so sánh IP sau resolve mới đáng tin.

### Setup in Node.js

Cách làm chống DNS rebinding gọn nhất là đặt kiểm tra vào chính hàm `lookup` mà socket dùng để lấy địa chỉ, nên IP đã kiểm tra chính là IP được kết nối. Global `fetch` của Node không cho gắn `lookup` trực tiếp; cần `Agent` của package `undici` (8.12.4 tại thời điểm kiểm tra 08/11/2026; `fetch` trong Node thực chất cũng là undici đóng gói sẵn). Code dưới đây là `lab/snippets/ssrf.ts`, đã chạy thật trên Node 26:

```ts
import { lookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch } from "undici";

const blocked = new BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16],
] as const) blocked.addSubnet(addr, prefix, "ipv4");
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");   // unique local
blocked.addSubnet("fe80::", 10, "ipv6");  // link-local

export function isBlockedIp(ip: string): boolean {
  const v4 = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip; // IPv4-mapped IPv6
  return blocked.check(v4, isIP(v4) === 6 ? "ipv6" : "ipv4");
}

function guardedLookup(hostname: string, options: any, cb: (...a: any[]) => void): void {
  lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err, address, family);
    const list: LookupAddress[] = Array.isArray(address) ? address : [{ address: address as string, family: family as number }];
    for (const a of list) if (isBlockedIp(a.address)) return cb(new Error(`blocked address ${a.address}`));
    cb(null, address, family);
  });
}

const agent = new Agent({ connect: { lookup: guardedLookup } });

export async function safeFetch(rawUrl: string, allowedHosts: ReadonlySet<string>) {
  const url = new URL(rawUrl);                                      // chuẩn hóa: 2130706433 -> 127.0.0.1
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("scheme not allowed");
  if (!allowedHosts.has(url.hostname)) throw new Error("host not in allowlist");
  // IP literal không đi qua lookup (socket kết nối thẳng), nên phải kiểm tra riêng ở đây
  const literal = url.hostname.replace(/^\[|\]$/g, ""); // bỏ [] của IPv6
  if (isIP(literal) && isBlockedIp(literal)) throw new Error(`blocked address ${literal}`);
  const res = await fetch(url, { dispatcher: agent, redirect: "manual", signal: AbortSignal.timeout(3000) });
  const body = await res.arrayBuffer();                             // thực tế: giới hạn kích thước khi đọc stream
  return { status: res.status, bytes: body.byteLength };
}
```

Kết quả chạy thật (`lab/snippets/demo-ssrf.ts`: một server nội bộ trả `INTERNAL-SECRET` trên `127.0.0.1:9099`, allowlist cố tình chứa cả `localhost` và `127.0.0.1` để thấy lớp kiểm tra IP làm việc):

```
host allowlist, trỏ vào loopback => blocked: blocked address ::1
IP số thập phân (2130706433)      => blocked: blocked address 127.0.0.1
IP literal 127.0.0.1              => blocked: blocked address 127.0.0.1
host ngoài allowlist              => blocked: host not in allowlist
scheme file:                      => blocked: scheme not allowed
```

Một bài học từ chính lần chạy này: bản đầu của `safeFetch` **chỉ** có `guardedLookup` và hai request tới IP literal (`127.0.0.1`, `2130706433`) đã lọt qua với `status: 200`, vì khi hostname đã là IP thì socket kết nối thẳng và không gọi `lookup`. Vì vậy dòng kiểm tra `isIP(literal)` là bắt buộc. `redirect: "manual"` để bạn tự quyết định có theo redirect hay không (và kiểm tra lại từng chặng). Đây vẫn là minh họa chưa đầy đủ: thiếu giới hạn kích thước khi đọc stream, kiểm tra content-type, và egress firewall ở tầng hạ tầng.

## 3. Path traversal

```ts
// LỖI: file=../../.env
res.sendFile(`/srv/storage/invoices/${req.query.file}`);   // hoặc fs.readFile(path.join(base, file))
```

Phòng thủ:

- Không dùng tên file của user để truy cập đĩa; lưu **ID** trong DB và ánh xạ sang đường dẫn.
- Nếu phải: allowlist ký tự rồi `path.resolve()` và kiểm tra tiền tố nằm trong thư mục gốc (kiểm tra `fs.realpath` nếu có symlink):

```ts
import path from "node:path";
const base = path.resolve("/srv/storage/invoices");
const target = path.resolve(base, String(req.query.file));       // chuẩn hóa mọi ../
if (!target.startsWith(base + path.sep)) return res.status(404).end();
```

- `res.sendFile(file, { root: base })` của Express từ chối `..` thoát khỏi `root`; vẫn nên lấy tên file từ DB. Không dùng `path.join(base, userInput)` rồi mở thẳng mà không kiểm tra: `join` chuẩn hóa nhưng không chặn việc thoát khỏi `base`.
- Cẩn thận null byte, encoding kép (`%2e%2e%2f`), Windows (`..\`), symlink.

## 4. File upload

Rủi ro: upload file thực thi vào thư mục web (RCE, ít gặp hơn ở Node nhưng vẫn có nếu bạn `express.static` thư mục upload kèm cấu hình cho phép chạy mã), file khổng lồ (DoS), SVG/HTML chứa script (stored XSS), ZIP bomb, polyglot.

Phòng thủ nhiều layer:

1. **Lưu ngoài thư mục được serve tĩnh**, hoặc object storage (S3) không thực thi mã.
2. **Tên file do server sinh** (UUID + extension từ allowlist); bỏ tên gốc.
3. Kiểm tra **loại thật** bằng nội dung (magic bytes), không tin `Content-Type` hay extension từ client; allowlist loại cần dùng (jpg, png, pdf).
4. Giới hạn kích thước (cả ở reverse proxy `client_max_body_size` và ứng dụng), số lượng.
5. Xử lý ảnh bằng cách **re-encode** (ví dụ `sharp`) để loại payload ẩn.
6. Phục vụ file qua domain tách biệt (cookieless, ví dụ `usercontent.example`) và header `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; SVG của user coi như HTML không tin cậy.
7. Quét virus nếu nghiệp vụ cần (ClamAV).

Với `multer` (2.5.0 tại thời điểm kiểm tra; dùng bản 2.x, các bản 1.x có advisory đã công bố, kiểm tra bằng `npm audit`). Đoạn này theo tài liệu package, chưa chạy trong lab:

```ts
import multer from "multer";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

app.post("/avatar", upload.single("avatar"), async (req, res) => {
  const buf = req.file?.buffer;
  const ext = !buf ? null : buf.subarray(0, 8).equals(PNG) ? "png" : buf.subarray(0, 3).equals(JPEG) ? "jpg" : null;
  if (!buf || !ext) return res.status(422).json({ error: "only png/jpg" });
  const name = `${randomUUID()}.${ext}`;                   // tên do server sinh
  await writeFile(`/srv/private-uploads/${name}`, buf);    // ngoài thư mục static
  res.status(201).json({ id: name });
});
```

## 5. Insecure deserialization

`JSON.parse` thuần dữ liệu nên không thực thi mã, đó là lý do nên dùng JSON để trao đổi. Rủi ro nằm ở những thứ **dựng lại object có hành vi** từ dữ liệu ngoài:

- Package kiểu `node-serialize` (`unserialize()` thực thi hàm được serialize dạng IIFE; CVE-2017-5941): không dùng.
- `eval`, `new Function`, `vm.runInNewContext` với chuỗi từ ngoài (`vm` không phải sandbox bảo mật).
- YAML loader cho phép tag tùy ý (kiểm tra mặc định của library bạn dùng; `js-yaml` 4.x `load` đã an toàn mặc định), XML parser bật entity ngoài (XXE: tắt DTD/entity).
- `v8.deserialize`, `structuredClone` trên dữ liệu ngoài: không thực thi mã nhưng vẫn cần giới hạn kích thước và validate sau khi parse.

```ts
// AN TOÀN HƠN: JSON + validate schema; ký HMAC nếu dữ liệu đi qua client
const Cart = z.strictObject({ items: z.array(z.strictObject({ bookId: z.number().int(), qty: z.number().int().min(1).max(20) })).max(50) });
const cart = Cart.parse(JSON.parse(req.cookies.cart));
```

Quy tắc: dùng JSON cho dữ liệu trao đổi; **ký** (HMAC) hoặc encrypt mọi dữ liệu trạng thái giao cho client; `express-session` ký cookie chứa session ID bằng `secret`, nên giữ `secret` bí mật tuyệt đối và hỗ trợ xoay vòng (mảng nhiều secret; chương 11).

## 6. Mass assignment

Khi bạn spread cả `req.body` vào ORM hoặc câu `UPDATE` (`User.update(req.body)`, `Object.assign(user, req.body)`, `db("users").update({ ...req.body })`), client gửi thêm `is_admin`, `role`, `user_id`, `price`... và chúng được ghi vào DB. Lab tái hiện: alice POST `{"name":"alice","is_admin":1}` vào endpoint lỗi và thành admin.

Bản lỗi trong `lab/app/server.ts` (`/vuln/profile`): gom mọi field client gửi (tên cột đã lọc bằng regex nên không có SQL injection, nhưng vẫn ghi được `is_admin`):

```ts
const entries = Object.entries(req.body ?? {}).filter(([k]) => /^[a-z_]+$/.test(k) && k !== "id");
const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
await pool.query(`UPDATE users SET ${sets} WHERE id = $${entries.length + 1} RETURNING id, name, email, is_admin`, [...entries.map(([, v]) => v), user.id]);
```

Bản sửa (`/fixed/profile`): schema allowlist bằng zod, `strictObject` từ chối field lạ (mặc định `z.object` chỉ **bỏ** field lạ, cũng an toàn nhưng im lặng; `strictObject` cho tín hiệu rõ ràng), và gán tường minh từng cột:

```ts
const ProfileInput = z.strictObject({ name: z.string().min(1).max(100).optional(), email: z.email().optional() });
const parsed = ProfileInput.safeParse(req.body ?? {});
if (!parsed.success) return res.status(422).json({ error: "invalid input", issues: /* ... */ });
await pool.query(
  "UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, name, email, is_admin",
  [parsed.data.name ?? null, parsed.data.email ?? null, user.id],
);
```

Kết quả thật (`lab/KET-QUA.md`, mục 4):

```
# /fixed/profile
HTTP/1.1 422 Unprocessable Entity
{"error":"invalid input","issues":[{"code":"unrecognized_keys","path":[],"message":"Unrecognized key: \"is_admin\""}]}
GET /admin/secret  ->  403 Forbidden

# /vuln/profile
HTTP/1.1 200 OK
{"id":1,"name":"alice","email":"alice@shop.test","is_admin":1}
GET /admin/secret  ->  200 OK  {"secret":"du lieu chi danh cho admin"}
```

Vì sao schema allowlist an toàn mặc định: cột mới thêm vào bảng **không** nằm trong schema nên không bao giờ bị gán; ngược lại kiểu blacklist ("bỏ `is_admin`") dễ sót cột mới. Với ORM (Prisma, Drizzle, Sequelize), đừng truyền `req.body` thẳng vào `create`/`update`; truyền object đã qua schema (`parsed.data`). Gán tường minh các thuộc tính nhạy cảm (role, giá) trong code, dùng DTO ở application layer (chương 9). Tương tự với response: chọn cột tường minh (`RETURNING id, name, email, is_admin`) để không trả `password_hash`, `token` (excessive data exposure).

## 7. Prototype pollution

Riêng của JavaScript: mọi object kế thừa từ `Object.prototype`. Nếu attacker ghi được thuộc tính vào prototype đó, **mọi object** trong process đều "có" thuộc tính ấy. Đường vào phổ biến: hàm deep merge/clone/`set(path, value)` đệ quy gặp khóa `__proto__` (hoặc `constructor.prototype`). `JSON.parse('{"__proto__":{"isAdmin":true}}')` tạo `__proto__` thành own property bình thường, rồi vòng `for...in` ghi thẳng vào `Object.prototype`.

Bản lỗi (`/vuln/settings` trong `lab/app/server.ts`):

```ts
function mergeUnsafe(target: Json, src: Json): Json {
  for (const k in src) {
    const v = src[k];
    if (v && typeof v === "object") target[k] = mergeUnsafe((target[k] ?? {}) as Json, v as Json);
    else target[k] = v;
  }
  return target;
}
```

Để thấy tác hại, lab có `/legacy/panel`: tạo `const flags = {}` rồi đọc `flags.isAdmin` (kiểu check "cờ" hay gặp trong code cũ). Kết quả thật (`lab/KET-QUA.md`, mục 5):

```
GET /legacy/panel                                   -> 403 Forbidden
POST /fixed/settings  {"__proto__":{"isAdmin":true}} -> 422 {"error":"invalid input","codes":["unrecognized_keys"]}
GET /legacy/panel                                   -> 403 Forbidden
POST /vuln/settings   {"__proto__":{"isAdmin":true}} -> 200 {"theme":"light","lang":"vi"}   (trông vô hại)
GET /legacy/panel                                   -> 200 {"panel":"ADMIN PANEL (khong can dang nhap)"}
```

Một request làm bẩn cả process cho tới khi restart, ảnh hưởng mọi user. Cách phòng:

1. **Validate schema trước khi merge** (bản sửa của lab dùng `z.strictObject`, từ chối khóa `__proto__`), và chỉ merge các field đã biết: `{ ...defaults, ...parsed.data }`.
2. Cấu trúc dữ liệu khóa động: dùng `Map`, hoặc `Object.create(null)` (không có prototype).
3. Nếu tự viết merge: bỏ qua `__proto__`, `constructor`, `prototype`, hoặc chỉ duyệt `Object.hasOwn`.
4. Đọc thuộc tính quan trọng bằng `Object.hasOwn(obj, key)` thay vì `obj.key`.
5. Giảm thiệt hại: chạy Node với `--disable-proto=delete` (xóa hẳn accessor `__proto__`; bản chất không chặn được đường `constructor.prototype`, nên chỉ là layer phụ).
6. Cập nhật dependency: `lodash`, `minimist`, `qs`, `axios` đều từng có advisory prototype pollution (xem lab `npm audit`, chương 12).

## 8. Trade-offs

- Allowlist host SSRF an toàn nhất nhưng kém linh hoạt; cho phép URL tùy ý buộc bạn dựng cả khối kiểm tra IP + egress control.
- Re-encode ảnh tốn CPU nhưng triệt payload ẩn.
- Schema allowlist tốn công liệt kê, đổi lại an toàn mặc định.
- `strictObject` báo lỗi cho client gửi field thừa (có thể làm vỡ client cũ gửi dư field); `object` mặc định âm thầm bỏ field lạ.

## 9. Pitfalls

- Tin `Content-Type`/file extension từ client.
- Kiểm tra URL bằng regex thay vì so IP sau resolve; quên redirect; quên rằng IP literal bỏ qua bước `lookup`.
- `eval`/`node-serialize`/YAML loader nguy hiểm trên dữ liệu ngoài.
- `Object.assign(model, req.body)` hoặc `{ ...req.body }` đưa vào ORM.
- Deep merge tự viết (hoặc `lodash.merge` bản cũ) trên JSON từ client.
- Trả thẳng lỗi của HTTP client về user (lộ topo nội bộ).

## 10. Summary

- SSRF: allowlist, kiểm IP sau resolve (tại `lookup` của socket) và cả IP literal, tắt redirect, tách network egress, IMDSv2.
- Path traversal/upload: không dùng tên file của user, lưu ngoài thư mục static, kiểm magic bytes, giới hạn kích thước.
- Deserialization: dùng JSON + schema, không `eval`/`node-serialize` dữ liệu ngoài, ký dữ liệu giao cho client.
- Mass assignment: schema allowlist (zod `strictObject`) và dùng `parsed.data`, không spread `req.body`.
- Prototype pollution: validate trước khi merge, `Map`/`Object.create(null)`, chặn `__proto__`, cập nhật dependency.

## 11. Self-check questions

1. Vì sao kiểm tra hostname bằng chuỗi là không đủ để chống SSRF, và vì sao chỉ cài `lookup` kiểm tra IP vẫn chưa đủ?
2. Hai cách đảm bảo đường dẫn không thoát khỏi thư mục gốc?
3. Vì sao schema allowlist an toàn hơn blacklist khi thêm cột mới?
4. Prototype pollution là gì và vì sao một request có thể ảnh hưởng mọi user?

<details><summary>Answer</summary>

1. Hostname có thể là dạng IP số, IPv6, domain trỏ về 127.0.0.1, redirect hoặc DNS rebinding; phải so IP sau resolve và kết nối tới đúng IP đó. Hostname là IP literal không đi qua `lookup`, nên phải kiểm tra riêng (lab đã gặp đúng lỗi này).
2. Không dùng tên file client (lưu ID trong DB); hoặc `path.resolve()` rồi kiểm tra tiền tố thư mục gốc (hoặc `sendFile` với `root`).
3. Cột mới không nằm trong schema nên mặc định không gán được; blacklist mặc định cho gán cột mới.
4. Ghi được vào `Object.prototype` (qua `__proto__`/`constructor.prototype`) khiến mọi object trong process kế thừa thuộc tính đó; process Node dùng chung giữa mọi request nên ảnh hưởng toàn bộ cho tới khi restart.
</details>
