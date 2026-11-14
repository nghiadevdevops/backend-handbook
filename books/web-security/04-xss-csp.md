# Chapter 4. XSS, CSP and Trusted Types

## 1. The problem

**Cross-Site Scripting (XSS)** là khi attacker khiến browser của nạn nhân chạy JavaScript của hắn *trong origin của bạn*. Hậu quả: đọc dữ liệu trên trang, thực hiện hành động thay người dùng (gọi API với cookie của họ), đánh cắp token lưu trong `localStorage`, hiện login form giả. Với browser, script đó "là" ứng dụng của bạn.

## 2. Three types of XSS

| Loại | Payload nằm ở | Ví dụ |
|---|---|---|
| **Reflected** | Request hiện tại, phản chiếu ngay vào response | `/search?q=<script>...` hiển thị lại `q` không encode |
| **Stored** | Lưu trong DB, hiển thị cho nhiều người | Bình luận sách chứa `<img src=x onerror=...>` |
| **DOM-based** | Chỉ ở JS phía client: nguồn (source) như `location.hash` đi vào sink như `innerHTML` | `el.innerHTML = location.hash.slice(1)` |

Stored nguy hiểm nhất vì không cần dụ nạn nhân bấm link.

## 3. The main fix: context-aware output encoding

Nguyên tắc: **encode khi xuất ra, theo context nơi dữ liệu được chèn**, không phải "làm sạch khi nhập" (cùng một chuỗi có thể cần encode khác nhau ở HTML, thuộc tính, JS, URL).

| Ngữ cảnh | Cách encode | Ví dụ ở Node/TypeScript |
|---|---|---|
| Nội dung HTML | HTML-entity (`<` thành `&lt;`) | hàm `escapeHtml` (5 ký tự `& < > " '`), hoặc template engine tự escape (EJS `<%= x %>`, Handlebars `{{x}}`, JSX `{x}`) |
| Giá trị attribute | HTML-entity **và luôn có dấu nháy** quanh attribute | `<input value="${escapeHtml(x)}">` |
| Trong `<script>` | JSON-encode, rồi escape `<` thành `<` | `JSON.stringify(x).replace(/</g, "\\u003c")` |
| URL | `encodeURIComponent` cho parameter; validate scheme | chặn `javascript:` trong `href` (parse bằng `new URL()`, chỉ cho `http:`/`https:`) |
| CSS | Tránh chèn input vào CSS | allowlist |

Hàm dùng trong lab (`lab/app/server.ts`) và cách bản lỗi khác bản sửa:

```ts
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// LỖI: in thô          ->  `<li>${r.body}</li>`
// ĐÃ SỬA: encode       ->  `<li>${escapeHtml(r.body)}</li>`
```

Điểm hay gặp ở Node: ghép HTML bằng template literal không escape gì cả; chỉ template engine (hoặc React/Vue) mới escape mặc định. Các "lối thoát" nguy hiểm: EJS `<%- x %>`, Handlebars `{{{x}}}`, Pug `!{x}`, Vue `v-html`, React `dangerouslySetInnerHTML`.

Nếu thực sự cần cho người dùng nhập HTML (rich text), dùng library sanitize dựa trên allowlist (ví dụ DOMPurify, chạy phía client hoặc phía server qua `jsdom`; `sanitize-html` phía server), không tự viết regex. Với Markdown, tắt HTML thô hoặc sanitize đầu ra.

DOM XSS: dùng `textContent` thay `innerHTML`; tránh `document.write`, `eval`, `setTimeout(string)`; với `href`/`src` từ input, validate scheme.

## 4. Content Security Policy (CSP)

CSP là response header báo browser **nguồn script nào được chạy**. Nó là layer giảm thiệt hại (defense in depth): nếu vẫn có chỗ chèn được HTML, CSP có thể chặn script chèn vào chạy.

### 4.1 Allowlist CSP is obsolete

`script-src 'self' cdn.example.com` dễ bị bypass vì các host cho phép thường chứa endpoint JSONP/gadget. Khuyến nghị hiện nay (tài liệu của Google, OWASP) là **strict CSP** dựa trên nonce hoặc hash.

### 4.2 Strict CSP with nonces

```
Content-Security-Policy:
  script-src 'nonce-{RANDOM}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none'
```

- `nonce-{RANDOM}`: giá trị ngẫu nhiên **mới cho mỗi response** (ít nhất 128 bit). Chỉ tag `<script nonce="...">` khớp mới chạy; script do attacker chèn không biết nonce nên bị chặn.
- `'strict-dynamic'`: script đã được tin (có nonce) được phép nạp thêm script khác động; đồng thời browser hỗ trợ sẽ **bỏ qua** allowlist host và `'self'`/`'unsafe-inline'` trong cùng directive. Giúp tương thích với bundler nạp chunk.
- `object-src 'none'`, `base-uri 'none'`: chặn plugin và tấn công đổi `<base>`.
- `frame-ancestors`: chống clickjacking (thay `X-Frame-Options`).

Mẫu Express + helmet (sinh nonce mỗi request; helmet cho phép giá trị directive là hàm `(req, res) => string`). Đoạn này minh họa theo tài liệu helmet 8, chưa chạy trong lab:

```ts
import { randomBytes } from "node:crypto";
import helmet from "helmet";

app.use((_req, res, next) => { res.locals.nonce = randomBytes(16).toString("base64"); next(); });
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      scriptSrc: [(_req, res) => `'nonce-${(res as any).locals.nonce}'`, "'strict-dynamic'"],
      objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"],
    },
  },
}));
// trong HTML trả về: `<script nonce="${res.locals.nonce}">/* mã inline của bạn */</script>`
```

Phần lab chạy thật là bản CSP tĩnh (không có inline script nên không cần nonce), cấu hình bằng helmet:

```ts
const csp = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"] },
  },
});
app.get("/fixed/comments", csp, handler);
```

Header thật nhận được (đã chạy, xem `lab/KET-QUA.md` mục 2): `Content-Security-Policy: default-src 'none';script-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none'`. Lưu ý helmet viết các directive liền nhau sau dấu `;` (không có khoảng trắng); browser vẫn parse đúng.

Nếu trang được **cache toàn phần** (CDN), nonce theo request không dùng được; dùng **hash** (`'sha256-...'`) cho script tĩnh.

### 4.3 Safe deployment

1. Bắt đầu bằng `Content-Security-Policy-Report-Only` và endpoint `report-to`/`report-uri` để thu vi phạm mà chưa chặn.
2. Sửa dần inline script/event handler (`onclick="..."` bị chặn bởi CSP strict; chuyển sang `addEventListener`).
3. Chuyển sang chế độ enforce.

### 4.4 Limits of CSP

CSP không ngăn: chèn HTML/CSS gây phishing (nếu không chặn `form-action`), đánh cắp dữ liệu bằng ảnh (trừ khi giới hạn `img-src`/`connect-src`), lỗi logic. Nó là lưới an toàn, không thay output encoding. Lab của cuốn sách này chạy thật một CSP để xem script chèn vào bị chặn ra sao (xem `lab/KET-QUA.md`, mục 2).

## 5. Trusted Types

Trusted Types là cơ chế CSP chống **DOM XSS ở sink**: khi bật, các sink nguy hiểm (`innerHTML`, `script.src`, `eval`...) chỉ nhận object "đã được tin" tạo qua một *policy* do code bạn định nghĩa, không nhận chuỗi thô.

```
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types myPolicy
```
```js
const policy = trustedTypes.createPolicy('myPolicy', {
  createHTML: (s) => DOMPurify.sanitize(s),
});
el.innerHTML = policy.createHTML(userInput);
```

Hỗ trợ browser: Chromium có từ lâu; các engine khác triển khai chậm hơn tại thời điểm tôi biết (**kiểm tra bảng tương thích MDN hiện tại**, chưa xác minh trong lần viết này). Vì vậy đặt nó như layer tăng cường, không phải layer duy nhất. Giá trị lớn nhất: biến "mọi nơi dùng `innerHTML` trong codebase" thành "vài policy cần review".

## 6. Cookies and XSS

Flag `HttpOnly` ngăn JS đọc session cookie, nên XSS không lấy trực tiếp được cookie đó, nhưng XSS vẫn thực hiện request **với tư cách người dùng** từ trong trang. Vì vậy HttpOnly giảm thiệt hại, không thay thế việc chống XSS (xem chương 5).

## 7. Trade-offs

- Encode-on-output: luôn làm. Không có lý do bỏ.
- Sanitize HTML (rich text): chỉ khi nghiệp vụ cần; mỗi lần nâng cấp library sanitize là một lần theo dõi CVE.
- Strict CSP: giá trị cao nhưng tốn công refactor inline script; ứng dụng cũ nhiều inline nên deploy theo Report-Only trước.
- Trusted Types: tốt cho SPA lớn; thừa cho trang server-render nhỏ ít JS.

## 8. Pitfalls

- Ghép HTML bằng template literal, hoặc `<%- %>` (EJS), `{{{ }}}` (Handlebars), `v-html`/`dangerouslySetInnerHTML` với dữ liệu người dùng.
- Escape bằng cách "xóa tag `<script>`": có hàng trăm cách khác chạy JS (`onerror`, `svg`, `javascript:`).
- `'unsafe-inline'` trong `script-src` làm CSP vô nghĩa với XSS.
- Nonce cố định hoặc dự đoán được; nonce bị cache lại.
- Lưu JWT trong `localStorage` rồi tin rằng CSP là đủ (chương 7).
- JSON API trả `Content-Type: text/html` hoặc thiếu `nosniff`, khiến response bị diễn giải như HTML.

## 9. Summary

- XSS cho phép chạy JS trong origin của bạn: reflected, stored, DOM.
- Chữa chính: encode theo context khi xuất; template literal ghép HTML thô thì không an toàn, template engine mặc định escape (và các lối thoát như `<%- %>`, `v-html`) cần review.
- CSP strict (nonce + `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`) là layer giảm thiệt hại; deploy bằng Report-Only trước.
- Trusted Types kiểm soát sink DOM XSS.

## 10. Self-check questions

1. Vì sao nên encode khi xuất thay vì lọc khi nhập?
2. Nonce phải thỏa điều kiện gì? Điều gì xảy ra nếu trang bị cache với nonce cũ?
3. `'strict-dynamic'` làm gì?
4. HttpOnly có chặn được XSS không?

<details><summary>Answer</summary>

1. Cách encode phụ thuộc context chèn (HTML, attribute, JS, URL); lúc nhập chưa biết dữ liệu sẽ xuất ở đâu.
2. Ngẫu nhiên, khó đoán (>=128 bit), mới cho mỗi response. Nếu cache nonce cũ, attacker có thể đọc và dùng lại nonce, hoặc script hợp lệ bị chặn do lệch nonce; dùng hash cho trang cache.
3. Cho phép script đã tin cậy (có nonce/hash) nạp thêm script khác, và bỏ qua allowlist host trong cùng directive.
4. Không. Nó chỉ ngăn JS đọc cookie; XSS vẫn gửi request thay người dùng.
</details>
