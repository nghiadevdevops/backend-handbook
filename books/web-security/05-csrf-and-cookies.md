# Chapter 5. CSRF and Cookies

## 1. The problem

Browser tự động đính cookie vào mọi request tới domain đó, kể cả request do trang khác kích hoạt. **Cross-Site Request Forgery (CSRF)**: `evil.example` chứa form tự submit tới `shop.example/api/orders/42/cancel`; nếu nạn nhân đang login vào shop, session cookie được gửi kèm, và server tưởng đó là hành động của họ. Attacker không đọc được response, nhưng gây được **side effect** (đổi email, chuyển tiền, hủy đơn).

CSRF chỉ liên quan khi authentication dựa vào thứ browser tự gửi (cookie, HTTP Basic, client certificate). API dùng header `Authorization: Bearer ...` do JS tự gắn thì không có CSRF kiểu này (nhưng có rủi ro lưu token, chương 7).

## 2. "Site" and "origin"

- **Origin** = scheme + host + port. `https://a.example.com` và `https://b.example.com` là hai origin khác nhau.
- **Site** = scheme + *registrable domain* (eTLD+1). Hai origin trên **cùng site** (`example.com`).

SameSite xét theo *site*, không phải origin: subdomain bị XSS vẫn tấn công được domain cha (nhớ khi dùng nhiều subdomain).

## 3. SameSite

Attribute `SameSite` của cookie quyết định khi nào cookie được gửi trong request cross-site:

| Giá trị | Hành vi |
|---|---|
| `Strict` | Chỉ gửi khi request xuất phát từ chính site đó. Click link từ ngoài vào sẽ không kèm cookie ở lần đầu. |
| `Lax` | Gửi cho top-level navigation bằng phương thức an toàn (GET) như click link; không gửi cho POST cross-site, iframe, fetch/XHR cross-site. |
| `None` | Luôn gửi (bắt buộc kèm `Secure`). Dành cho nhu cầu cross-site thực sự (embed, SSO). |

**Mặc định của browser**: Chrome (và Chromium như Edge) coi cookie không ghi SameSite là `Lax` (bắt đầu triển khai từ 2020), kèm ngoại lệ "Lax+POST" tạm thời trong khoảng 2 phút sau khi cookie được set. Trạng thái của Firefox và Safari: không nên giả định chúng mặc định `Lax` (**chưa xác minh trong lần viết này**; kiểm tra MDN trang `Set-Cookie`). Kết luận thực hành: **luôn đặt SameSite tường minh**, đừng dựa vào mặc định, và coi SameSite là *một layer*, không phải biện pháp chống CSRF duy nhất (vì: browser cũ, ngoại lệ Lax+POST, tấn công từ cùng site/subdomain, GET có side effect).

## 4. CSRF token

Cách chống CSRF cổ điển, độc lập với browser:

- **Synchronizer token**: server sinh token ngẫu nhiên gắn với session, nhúng vào form (`_token`), kiểm tra khi POST. Attacker không đọc được token vì Same-Origin Policy.
- **Double submit cookie**: token ở cookie và ở header/body, server so sánh; an toàn hơn khi ký/gắn session (bản "trần" bị tấn công nếu attacker ghi được cookie qua subdomain).
- **Custom header** cho API: yêu cầu header như `X-CSRF-TOKEN`; request cross-site phải qua CORS preflight nên bị chặn nếu không cho phép origin.

### Express/Node

Express không có CSRF protection tích hợp, và `csurf` (package cũ của nhóm Express) đã **bị archive, không còn maintain** (trên npm có thông báo deprecated, kiểm tra 08/11/2026): không dùng cho dự án mới. Lựa chọn hiện tại:

1. **`csrf-csrf`** (4.1.0 tại thời điểm kiểm tra): triển khai double-submit cookie có ký (HMAC) gắn với session. Cấu hình tối thiểu theo README của package (tên option có thể đổi giữa các major, đối chiếu README bản bạn cài; đoạn này chưa chạy trong lab):

```ts
import { doubleCsrf } from "csrf-csrf";

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => req.session.id,        // gắn token với session
  cookieName: "__Host-csrf",
  cookieOptions: { sameSite: "lax", secure: true, path: "/" },
});
app.use(doubleCsrfProtection);                           // kiểm tra mọi request không an toàn (POST/PUT/DELETE)
app.get("/csrf-token", (req, res) => res.json({ token: generateCsrfToken(req, res) }));
```

   SPA đọc token từ endpoint rồi gửi lại ở header (mặc định `x-csrf-token`).
2. **Kiểm tra header của browser** (không cần token): từ chối request đổi trạng thái khi `Sec-Fetch-Site` là `cross-site`, hoặc khi `Origin` không thuộc allowlist. Đây là layer bổ sung rẻ, nhưng browser rất cũ không gửi `Sec-Fetch-Site` nên không nên là biện pháp duy nhất.

```ts
app.use((req, res, next) => {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (unsafe && req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ error: "cross-site request blocked" });
  next();
});
```

Hãy giữ danh sách loại trừ (route không kiểm tra CSRF) thật ngắn, chỉ cho webhook đã authenticate bằng chữ ký.

### Design rules

- Không dùng GET cho thao tác đổi trạng thái.
- Kiểm tra `Origin`/`Referer` phía server như layer phụ cho các request nhạy cảm.
- Hành động rất nhạy cảm (đổi password, chuyển tiền): yêu cầu nhập lại password hoặc MFA (re-authentication).

## 5. Cookie flags

```
Set-Cookie: __Host-session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax
```

| Flag | Tác dụng |
|---|---|
| `Secure` | Chỉ gửi qua HTTPS; chống nghe lén trên HTTP |
| `HttpOnly` | JS không đọc được `document.cookie`; giảm thiệt hại XSS |
| `SameSite` | Như trên |
| `Path`, `Domain` | Scope. Không đặt `Domain` thì cookie chỉ thuộc đúng host (host-only), an toàn hơn đặt `Domain=example.com` làm mọi subdomain đọc/ghi được |
| `Max-Age`/`Expires` | Thời hạn; cookie chứa session nên ngắn hạn hoặc là session cookie |

### The `__Host-` and `__Secure-` prefixes

Tên cookie có prefix được browser ép điều kiện:

- `__Secure-`: phải có `Secure` và được set từ trang HTTPS.
- `__Host-`: ngoài đó còn **không có `Domain`** và `Path=/`. Nghĩa là host-only, subdomain không ghi đè được cookie này. Đây là lựa chọn mạnh nhất cho session cookie.

### Configuring cookies in Express

Cookie thủ công (`res.cookie` của Express):

```ts
res.cookie("__Host-session", sessionId, {
  httpOnly: true,
  secure: true,           // sau reverse proxy cần app.set("trust proxy", ...) đúng (chương 11)
  sameSite: "lax",        // "strict" nếu không cần login từ link ngoài
  path: "/",              // bắt buộc với __Host-; KHÔNG đặt domain
  maxAge: 30 * 60 * 1000, // ms
});
```

Với `express-session` (1.19.0 tại thời điểm kiểm tra, vẫn được release):

```ts
app.use(session({
  name: "__Host-shop_session",
  secret: process.env.SESSION_SECRET!,   // từ secret store, không hard-code (chương 11)
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  // store: bắt buộc dùng store ngoài (Valkey/Redis, PostgreSQL) ở production; MemoryStore chỉ để dev
}));
```

(Đoạn cấu hình trên theo tài liệu package, chưa chạy trong lab. Tên option giữ ổn định qua nhiều năm, nhưng hãy đối chiếu README bản bạn cài.)

## 6. Trade-offs

- `Strict`: an toàn nhất nhưng người dùng click link từ email tới shop sẽ thấy như chưa login ở lần tải đầu. `Lax` là cân bằng thường dùng.
- `SameSite=None`: cần cho iframe thanh toán/SSO cross-site; khi đó CSRF token là bắt buộc.
- API thuần dùng Bearer token tránh CSRF nhưng chuyển rủi ro sang chỗ lưu token.

## 7. Pitfalls

- Tin mặc định `Lax` của browser.
- Loại trừ cả `/api/*` khỏi middleware CSRF trong khi API vẫn authenticate bằng cookie.
- Endpoint GET đổi trạng thái (`/logout`, `/delete?id=`).
- CORS `Access-Control-Allow-Origin` phản chiếu mọi `Origin` kèm credentials (biến CORS thành vulnerability).
- Subdomain yếu/bị takeover cho phép ghi cookie lên domain cha.
- Không đổi session ID sau login (session fixation, chương 7).

## 8. Summary

- CSRF lợi dụng việc browser tự gửi cookie; chỉ cần quan tâm khi authentication bằng cookie.
- SameSite là layer tốt nhưng phải đặt tường minh; vẫn cần CSRF token cho thao tác đổi trạng thái.
- Cookie phiên nên: `Secure; HttpOnly; SameSite=Lax/Strict`, tên `__Host-`, không đặt `Domain`.
- Hành động nhạy cảm cần re-authentication.

## 9. Self-check questions

1. Khác biệt giữa origin và site? Vì sao nó quan trọng với SameSite?
2. Request POST cross-site có gửi cookie `SameSite=Lax` không?
3. Điều kiện của prefix `__Host-` là gì?
4. Vì sao API dùng Bearer token trong header không bị CSRF kiểu cookie?

<details><summary>Answer</summary>

1. Origin = scheme+host+port; site = scheme+eTLD+1. SameSite so sánh theo site nên các subdomain cùng site vẫn là "same-site".
2. Không (ngoại trừ ngoại lệ Lax+POST tạm thời của Chrome ngay sau khi set cookie).
3. `Secure`, set từ HTTPS, không có `Domain`, `Path=/`.
4. Header `Authorization` do JS gắn thủ công, browser không tự gửi ở request do trang khác kích hoạt.
</details>
