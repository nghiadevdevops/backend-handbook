# Chương 11. Secrets, cấu hình, security header và TLS

## 1. Vấn đề

Nhiều vụ lộ dữ liệu không do khai thác code mà do **cấu hình**: file `.env` được web server phục vụ, chế độ debug bật trên production hiện stack trace kèm environment variable, API key đẩy lên GitHub, bucket mở công khai. Security Misconfiguration là A02 trong OWASP Top 10:2025, và "mishandling of exceptional conditions" (A10) bao gồm việc lỗi làm lộ thông tin. Chương này nói cách quản lý secret, cấu hình an toàn, header phòng thủ và TLS.

## 2. Secrets

**Secret** = mọi thứ cho quyền truy cập: password DB, API key, `SESSION_SECRET`/key ký cookie, JWT signing key, private key TLS, webhook secret.

Nguyên tắc:

1. **Không commit** secret vào Git (kể cả repo private, kể cả "xóa ở commit sau": lịch sử vẫn còn). Thêm `.env` vào `.gitignore`, commit `.env.example` không có giá trị thật.
2. **Quét tự động** để bắt lỡ tay: pre-commit hook và CI với công cụ như gitleaks hoặc trufflehog; bật GitHub secret scanning/push protection.
3. **Inject lúc chạy**, không nướng vào image: environment variable, Docker/Kubernetes secrets, hoặc trình quản lý secret (Vault, AWS Secrets Manager, GCP Secret Manager). Không `COPY .env` vào image; `docker history` đọc được mọi layer.
4. **Secret theo môi trường**, mỗi service một key riêng, least privilege.
5. **Rotation** định kỳ và ngay khi nghi lộ; thiết kế để rotate không cần downtime (hai key hợp lệ song song trong lúc chuyển).
6. **Khi lộ**: coi như đã bị dùng; revoke trước, điều tra sau; xóa khỏi lịch sử Git chỉ là bước phụ.

### Node.js

- Đọc secret từ biến môi trường (hoặc file secret mount vào container) **một lần lúc khởi động** và fail nhanh nếu thiếu, thay vì rải `process.env.X` khắp code. Validate cấu hình bằng schema:

```ts
import { z } from "zod";
const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),   // secret ký cookie session
});
export const env = Env.parse(process.env);   // ném lỗi khi khởi động nếu thiếu/ngắn
```

- Node.js (từ 20.6) đọc file `.env` bằng cờ `--env-file=.env`; hữu ích khi dev. Production nên inject biến từ nền tảng, không đóng gói `.env` vào image.
- Secret ký/encrypt cookie (`SESSION_SECRET` của `express-session`, secret HMAC, key JWT) lộ thì attacker forge được cookie/token. `express-session` nhận **mảng** secret: phần tử đầu dùng để ký mới, các phần tử sau chỉ để verify, cho phép rotation không làm mất session ngay.
- Đừng `console.log(process.env)` hay trả `process.env`/cấu hình ra endpoint debug.
- Production: `NODE_ENV=production` (Express tắt stack trace trong response lỗi mặc định, bật cache view). Kiểm tra `.dockerignore` loại `.env`, `.git`, `node_modules`.
- File `.env` ngoài thư mục được serve tĩnh; chỉ `express.static` đúng một thư mục công khai (ví dụ `public/`), không bao giờ `express.static(".")`.

## 3. Cấu hình an toàn

- `NODE_ENV=production`, không bật chế độ debug. Trang lỗi chung chung cho client, chi tiết vào log (chương 13). Express 5 có error-handling middleware mặc định, nhưng bạn nên tự viết một handler cuối app trả `{"error":"internal error"}` và log chi tiết phía server. Lab của sách cho thấy một lỗi SQL lộ nguyên văn thông báo của DB (`unterminated quoted string at or near ...`): đó là dạng lộ thông tin cần tránh.
- Tắt banner phiên bản: `app.disable("x-powered-by")` (helmet cũng bỏ header này), `server_tokens off` (nginx).
- Tắt directory listing, chặn truy cập `.git`, `.env`, `package.json`, `node_modules/` từ web.
- Tài khoản DB least privilege; Redis/DB không mở ra Internet (bind nội bộ, password, network policy).
- Container: user không phải root, filesystem read-only khi được, `--cap-drop ALL`, image nhỏ (distroless/alpine), không đặt secret trong biến `ENV` của Dockerfile.
- Secure by default (chương 1): môi trường mới dựng lên phải an toàn trước khi ai đó chỉnh.
- Xử lý lỗi theo hướng **fail closed**: exception trong authorization check thì từ chối, không "cho qua".

## 4. Security header

Response header chỉ dẫn browser bật thêm cơ chế phòng thủ. Rẻ, nên làm hết:

| Header | Giá trị gợi ý | Tác dụng |
|---|---|---|
| `Strict-Transport-Security` (HSTS) | `max-age=31536000; includeSubDomains` (thêm `preload` khi đã chắc) | Buộc browser luôn dùng HTTPS cho domain này, chống SSL-stripping |
| `X-Content-Type-Options` | `nosniff` | Không đoán MIME; chặn biến file text/JSON thành script/HTML |
| `Content-Security-Policy` | Xem chương 4 | Giới hạn nguồn script, chống XSS, clickjacking (`frame-ancestors`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (hoặc `no-referrer` cho trang nhạy cảm) | Hạn chế URL (chứa token/ID) bị rò qua header Referer |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Tắt tính năng browser mà trang không dùng |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cô lập cửa sổ, giảm tấn công cross-window |
| `Cache-Control` | `no-store` cho response nhạy cảm | Không lưu trên cache chia sẻ/proxy |
| `X-Frame-Options` | `DENY` | Cũ; ưu tiên `frame-ancestors` của CSP, giữ làm dự phòng |

Cảnh báo HSTS: khi bật `includeSubDomains` và `preload`, **mọi** subdomain phải phục vụ HTTPS; đưa domain vào preload list của browser là khó gỡ. Đi dần: `max-age` ngắn (vài phút), tăng dần, rồi mới `preload`.

Trong Express, dùng **helmet** (8.3.0 tại thời điểm kiểm tra 08/11/2026, vẫn được release) thay vì tự đặt từng header. Lab dùng helmet cho CSP; khi bật với cấu hình CSP riêng, các header khác của helmet đi kèm mặc định. Response thật của `/fixed/comments` (`lab/KET-QUA.md`, mục 2):

```
Content-Security-Policy: default-src 'none';script-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none'
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
```

Lưu ý khi đọc danh sách này: helmet **không** đặt `Permissions-Policy` (bạn tự thêm), đặt `X-XSS-Protection: 0` (tắt bộ lọc XSS cũ của browser vì chính nó từng gây lỗi), và `Strict-Transport-Security` mặc định gửi cả khi bạn đang chạy HTTP (browser bỏ qua HSTS trên HTTP, nhưng đừng bật `includeSubDomains` mà chưa chắc các subdomain đều có HTTPS). Cấu hình tối thiểu cho app thật (đoạn này theo tài liệu helmet, chưa chạy riêng trong lab):

```ts
app.disable("x-powered-by");
app.use(helmet({ referrerPolicy: { policy: "strict-origin-when-cross-origin" } }));
app.use((_req, res, next) => { res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); next(); });
```

Kiểm tra từ ngoài vào: `curl -sI https://domain` và đối chiếu với công cụ như Mozilla Observatory (kết quả chấm điểm chỉ là chỉ dẫn, không phải tuyên bố an toàn).

## 5. TLS

- Mọi thứ qua **HTTPS**, kể cả nội bộ giữa service khi qua network không tin cậy (mTLS trong service mesh).
- Phiên bản: **TLS 1.2 là sàn, ưu tiên TLS 1.3** (RFC 8446); tắt SSLv3, TLS 1.0/1.1 (đã bị IETF chính thức loại bỏ ở RFC 8996).
- Dùng cấu hình cipher đã được kiểm chứng (Mozilla SSL Configuration Generator, mức "intermediate" hoặc "modern") thay vì tự chọn cipher.
- Certificate: Let's Encrypt/ACME tự động gia hạn; monitoring hạn dùng (certificate hết hạn là availability incident). Certificate ngày càng có lifetime ngắn hơn theo quy định của CA/Browser Forum (kiểm tra mức hiện hành; chưa xác minh con số cụ thể trong lần viết này), nên tự động hóa là bắt buộc.
- Private key: quyền file chặt, không commit, cân nhắc HSM/KMS cho key quan trọng.
- Redirect HTTP sang HTTPS + HSTS; cookie `Secure`.
- Ứng dụng phía sau reverse proxy/load balancer: cấu hình **trusted proxies** đúng (Express: `app.set("trust proxy", <số hop hoặc danh sách IP của proxy>)`; đừng đặt `true` nếu app còn truy cập trực tiếp được) để `X-Forwarded-Proto/For` chỉ được tin từ proxy của bạn; không thì attacker giả IP (qua mặt rate limit, log sai) hoặc ứng dụng sinh URL `http://`.
- Gọi service ngoài: **bật verify certificate** (Node mặc định đã verify; không bao giờ đặt `NODE_TLS_REJECT_UNAUTHORIZED=0` hay `rejectUnauthorized: false` "cho chạy được").
- Cryptography trong ứng dụng: dùng `node:crypto` đúng cách (AES-256-GCM, `scrypt`/`timingSafeEqual`) hoặc libsodium; sinh ngẫu nhiên bằng `crypto.randomBytes`/`crypto.randomUUID`/`crypto.randomInt`, không `Math.random()` cho token.

## 6. Trade-off

- Secret manager chuyên dụng tăng độ an toàn nhưng thêm hạ tầng; dự án nhỏ có thể bắt đầu với secret của nền tảng deploy (GitHub Actions secrets, Docker/Kubernetes secrets) kèm quét tự động.
- HSTS preload bảo vệ lần truy cập đầu nhưng khó đảo ngược.
- CSP, COOP chặt có thể làm hỏng tích hợp third-party (widget, thanh toán); deploy theo Report-Only.

## 7. Cạm bẫy

- `.env` hoặc `.git` truy cập được qua web vì document root sai.
- Chế độ debug/stack trace bật ở production (`NODE_ENV` không phải `production`).
- Secret trong URL/query (lộ qua log, Referer), trong log, trong ảnh Docker, trong Slack/ticket.
- `NODE_TLS_REJECT_UNAUTHORIZED=0` hoặc `rejectUnauthorized: false` bị bỏ quên.
- Cấu hình cho `X-Forwarded-For` tin mọi nguồn.
- Một key dùng cho mọi môi trường; không có quy trình rotation.

## 8. Tóm tắt

- Secret không vào Git/image; inject lúc chạy, rotation, quét tự động.
- Production: `NODE_ENV=production`, ẩn banner, chặn truy cập file nhạy cảm, least privilege.
- Header cơ bản: HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP; deploy HSTS từng bước.
- TLS 1.2+ (ưu tiên 1.3), certificate tự động gia hạn, cấu hình trusted proxies đúng.

## 9. Câu hỏi tự kiểm tra

1. Vì sao xóa secret ở commit sau vẫn chưa an toàn?
2. `nosniff` ngăn điều gì?
3. Rủi ro của HSTS `preload` khi một subdomain chưa có HTTPS?
4. Vì sao phải cấu hình trusted proxies khi ứng dụng đứng sau load balancer?

<details><summary>Đáp án</summary>

1. Lịch sử Git vẫn chứa secret (và có thể đã bị sao chép/quét); phải revoke và rotate secret.
2. Việc browser tự đoán MIME và thực thi nội dung (ví dụ file text/JSON bị xử lý như script/HTML).
3. Browser sẽ từ chối truy cập subdomain qua HTTP, gây lỗi; gỡ khỏi preload list mất rất lâu.
4. Để chỉ tin `X-Forwarded-*` từ proxy của mình; nếu không attacker giả IP/giao thức, làm sai log, rate limit và URL sinh ra.
</details>
