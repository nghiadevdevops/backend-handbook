# Chapter 3. Injection

## 1. The problem

Injection xảy ra khi dữ liệu không tin cậy bị **trộn vào statement/query** và interpreter (SQL engine, shell, template engine...) hiểu nó là *mã* thay vì *dữ liệu*. Nguyên nhân gốc luôn giống nhau: ghép chuỗi giữa kênh điều khiển và kênh dữ liệu. Cách chữa gốc cũng giống nhau: **tách hai kênh** (parameterization), không cố "lọc ký tự xấu".

## 2. SQL injection

### 2.1 Mechanics

Code lỗi (TypeScript + `pg`; trích từ `lab/app/server.ts`, endpoint `/vuln/books`):

```ts
const q = String(req.query.q ?? "");
const { rows } = await pool.query(`SELECT id, title, price FROM books WHERE title LIKE '%${q}%'`);
```

Gửi `q=zzz' UNION SELECT id, password_hash, is_admin FROM users --` thì câu SQL thành một query khác, đọc được bảng `users`. Request/response thật của lab (`lab/KET-QUA.md`, mục 1):

```
$ curl -G http://bookcheck-sec-app:8080/vuln/books --data-urlencode "q=zzz' UNION SELECT id, password_hash, is_admin FROM users --"
[{"id":3,"title":"HASH-ROOT-SECRET","price":1},{"id":2,"title":"HASH-BOB-SECRET","price":0},{"id":1,"title":"HASH-ALICE-SECRET","price":0}]
```

Biến thể: boolean-based (đúng/sai qua hành vi), time-based (`pg_sleep`), error-based, second-order (dữ liệu độc được lưu rồi mới dùng trong câu SQL sau). Lab cũng cho thấy một dấu nháy đơn trả về `{"error":"unterminated quoted string at or near \"'\""}`: thông báo lỗi của PostgreSQL đi thẳng ra client, giúp attacker dò schema.

### 2.2 The fix: parameterized queries

Trích từ `lab/app/server.ts`, endpoint `/fixed/books`:

```ts
const { rows } = await pool.query(
  "SELECT id, title, price FROM books WHERE title LIKE $1",
  [`%${q}%`],
);
```

Với `pg`, khi có mảng giá trị thì câu lệnh chạy qua extended query protocol của PostgreSQL: text SQL (có `$1`) và giá trị được gửi riêng, server không bao giờ parse giá trị như SQL. Cùng payload UNION ở trên trả về `[]` (bị coi là chuỗi tìm kiếm). Lưu ý `$1` chỉ thay cho **giá trị**, không thay cho tên cột, tên bảng hay `ASC/DESC`. Template literal của JavaScript (dấu backtick và `${}`) là cách ghép chuỗi, không phải parameterization: `pool.query(\`... ${q}\`)` vẫn lỗi.

### 2.3 ORMs and query builders can still be vulnerable

Knex, Prisma, Drizzle, Kysely, Sequelize đều bind giá trị tự động, nhưng những chỗ sau **không** được bind:

```ts
// 1. Column name / sort direction lấy từ input
db("books").orderBy(req.query.sort as string);                    // nguy hiểm: sort quyết định column
// 2. Raw expression nối chuỗi
db.raw(`title LIKE '%${q}%'`);                                    // nguy hiểm
db.raw("title LIKE ?", [`%${q}%`]);                               // an toàn: có binding
// 3. Raw query của ORM với chuỗi nối (Sequelize, Prisma $queryRawUnsafe...)
prisma.$queryRawUnsafe(`SELECT * FROM books WHERE id = ${id}`);  // nguy hiểm; dùng $queryRaw`...${id}` (tagged template) thì an toàn
```

Khóa chung: tên API có chữ `raw` hay `unsafe` là điểm cần review. Với tên cột, hãy allowlist:

```ts
const SORTABLE = new Set(["title", "price", "created_at"]);
const col = SORTABLE.has(String(req.query.sort)) ? String(req.query.sort) : "created_at";
db("books").orderBy(col);
```

Mẹo: tìm nhanh các điểm rủi ro bằng `grep -rnE "\.raw\(|queryRawUnsafe|\.query\(\`|sequelize\.query" src/`.

### 2.4 Additional defenses

- DB user theo least privilege (chương 1).
- Không trả lỗi SQL chi tiết ra client (chương 11): bắt lỗi, log phía server, trả `{"error":"internal error"}`. Express 5 chuyển lỗi của handler `async` (promise bị reject) vào error-handling middleware, nên đặt một handler chung cuối app.
- Validate type (`id` phải là số nguyên, ví dụ bằng zod `z.coerce.number().int()`): giúp, nhưng không thay parameterization.
- **Second-order**: dữ liệu đã lưu vẫn là không tin cậy khi dùng lại.

## 3. Command injection

```ts
import { exec, execFile } from "node:child_process";

// LỖI: exec chạy qua shell, file=a.png; rm -rf /
exec(`convert ${req.query.file} out.png`);
// TỐT HƠN: execFile không qua shell, mỗi argument là một phần tử mảng
execFile("convert", ["--", String(req.query.file), "out.png"]);
```

Chữa theo thứ tự ưu tiên:

1. **Tránh gọi shell**: dùng library (ví dụ `sharp` cho ảnh) thay vì chạy lệnh ngoài.
2. Nếu bắt buộc, dùng `execFile`/`spawn` với **array argument** và **không** bật `shell: true`. Đây là cách tách kênh. `exec` luôn dùng shell.
3. Tự "escape" chuỗi để đưa vào `exec` là phương án cuối, dễ sai (khác nhau giữa bash và `cmd.exe` trên Windows); đừng tin nó như fix chính.
4. Allowlist giá trị cho phép; chạy dưới unprivileged user, trong container.

Cũng cần cẩn thận argument bắt đầu bằng `-` (argument injection): thêm `--` ngăn tùy chọn khi tool hỗ trợ. Ghi chú: Node.js từng có CVE liên quan `spawn` trên Windows với file `.bat`/`.cmd` (luôn qua `cmd.exe`); hãy dùng bản Node đã vá và đối chiếu security release hiện hành (chưa xác minh chi tiết từng CVE).

## 4. NoSQL injection

Không chỉ SQL mới bị. Với MongoDB, nếu bạn đưa thẳng input JSON vào filter:

```ts
// LỖI: nếu req.body.password là object { "$ne": "x" } thì điều kiện thành "password khác x"
const user = await users.findOne({ email: req.body.email, password: req.body.password });
```

và client gửi JSON `{"email":"admin@shop.test","password":{"$ne":"x"}}` thì điều kiện luôn đúng: bypass login. Query string cũng có thể thành object nếu app bật parser mở rộng (`qs`, ví dụ `?password[$ne]=x`); Express 5 mặc định dùng parser "simple" nên `password[$ne]=x` chỉ là một key chuỗi, nhưng body JSON thì luôn tạo được object. Chữa: validate bằng schema để ép kiểu scalar (`z.string()` từ chối object), và so sánh password qua hàm hash riêng (chương 6) thay vì query theo password. Đoạn này minh họa, chưa chạy trong lab.

```ts
const Login = z.strictObject({ email: z.email(), password: z.string().min(1).max(256) });
const input = Login.parse(req.body);   // {"$ne":"x"} bị từ chối vì không phải string
```

## 5. Template injection (SSTI) and other injections

**Server-Side Template Injection**: khi input được **compile như template** thay vì truyền vào như biến.

```ts
// LỖI: tạo template từ input người dùng (EJS, Handlebars, Pug... đều có rủi ro tương tự)
const html = ejs.render(req.body.template, { user });   // EJS cho chạy JavaScript trong template => RCE
// AN TOÀN: template cố định, dữ liệu là biến
const html = ejs.render(fixedTemplate, { name: req.body.name });
```

Quy tắc: **không bao giờ đưa input vào chuỗi template**. Nếu cần cho người dùng tùy biến nội dung (email mẫu), dùng engine logic-less (mustache) với placeholder allowlist. Tương tự, `eval(input)`, `new Function(input)` là code injection trực tiếp; module `node:vm` **không** phải sandbox bảo mật.

Các họ injection khác cùng cơ chế: LDAP, XPath, header injection (CRLF vào header HTTP/email), log injection (xuống dòng giả log, chương 13), expression language, `eval`/deserialization (chương 10). Khi thấy tiếng "ghép chuỗi vào thứ có ngữ pháp", hãy nghĩ ngay đến injection.

## 6. Trade-offs

| Cách | Ưu | Nhược |
|---|---|---|
| Parameterized query | Chữa gốc, rẻ | Không dùng được cho column/table name |
| Allowlist | Chắc chắn cho identifier | Phải duy trì danh sách |
| Escaping | Dùng được ở chỗ không bind được | Dễ sai theo ngữ cảnh/charset |
| Stored procedure | Tách thêm một layer | Vẫn bị nếu bên trong ghép chuỗi |
| WAF | Giảm nhiễu | Có thể bị bypass; không phải fix gốc |

## 7. Pitfalls

- Tin rằng "dùng ORM nên an toàn" rồi viết `raw(...)` hay `$queryRawUnsafe` với template literal.
- Dùng template literal trong `pool.query(...)` vì trông giống "tham số".
- Tự viết hàm escape rồi nghĩ đã xong (phụ thuộc ngữ cảnh/charset, sai với số không có dấu nháy).
- Lọc keyword (`UNION`, `SELECT`): luôn bypass được (viết hoa/thường, comment, encoding).
- Chỉ kiểm tra input ở form, quên API/queue/import CSV.
- Quên second-order.

## 8. Summary

- Injection = trộn dữ liệu vào kênh điều khiển; chữa bằng tách kênh.
- SQL: luôn parameterize (`$1` với `pg`); column name/sort direction thì allowlist; ORM vẫn có `raw`/`unsafe`.
- Command: tránh shell, dùng `execFile` với array argument. NoSQL: schema ép kiểu scalar. SSTI: không compile input.
- Kết hợp DB least privilege để giảm thiệt hại.

## 9. Self-check questions

1. Vì sao `orderBy(req.query.sort)` nguy hiểm dù query builder dùng prepared statement?
2. `db.raw(\`a = ${x}\`)` và `db.raw("a = ?", [x])` khác nhau thế nào?
3. Nêu hai cách tránh command injection tốt hơn việc tự escape chuỗi cho `exec`.
4. Tại sao `{"password":{"$ne":"x"}}` làm bypass login MongoDB, và schema nào chặn được?

<details><summary>Answer</summary>

1. Column name không thể bind parameter; chuỗi người dùng đi thẳng vào câu SQL. Phải allowlist.
2. Cái đầu nối chuỗi (injectable); cái sau bind `x` làm parameter.
3. Không gọi shell (dùng library), hoặc dùng `execFile`/`spawn` với array argument và không bật `shell: true`; ngoài ra allowlist, chạy quyền thấp.
4. Driver hiểu `$ne` là operator "khác", nên điều kiện luôn đúng. Schema `z.string()` từ chối object nên input không bao giờ tới driver.
</details>
