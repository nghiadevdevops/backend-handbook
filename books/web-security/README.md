# Bảo mật ứng dụng web cho developer

Bản học bằng tiếng Việt, viết tháng 11/2026 cho developer backend TypeScript/Node.js (SQL, REST API) đã nắm system design và API design cơ bản. Ví dụ xuyên suốt: một shop sách nhỏ (`Book`, `Order`, `User`, `Comment`).

## Ai nên đọc, cần biết gì

- Đã viết API Node.js/TypeScript (Express hoặc tương tự), biết SQL, HTTP, cookie cơ bản.
- Biết Docker ở mức chạy container (để làm lab).
- Không cần kiến thức bảo mật trước đó.

## Mục lục

1. [Tư duy bảo mật: threat modeling, defense in depth](01-security-mindset.md)
2. [OWASP Top 10:2025 và ASVS 5.0](02-owasp-top10-and-asvs.md)
3. [Injection: SQL, command, NoSQL, template](03-injection.md)
4. [XSS, CSP, Trusted Types](04-xss-csp.md)
5. [CSRF và cookie](05-csrf-and-cookies.md)
6. [Authentication: password, MFA, passkeys](06-authentication.md)
7. [Session và JWT](07-sessions-and-jwt.md)
8. [OAuth 2.0, OIDC, OAuth 2.1](08-oauth-oidc.md)
9. [Authorization: RBAC/ABAC/ReBAC, IDOR/BOLA](09-authorization.md)
10. [SSRF, path traversal, upload, deserialization, mass assignment, prototype pollution](10-ssrf-upload-deserialization.md)
11. [Secrets, cấu hình, security header, TLS](11-secrets-header-tls.md)
12. [Supply chain: npm audit, lockfile, provenance, SBOM, Sigstore, SLSA](12-supply-chain.md)
13. [Security logging và incident response](13-logging-and-incident-response.md)

Lab: [`lab/`](lab/) và kết quả chạy thật: [`lab/KET-QUA.md`](lab/KET-QUA.md).

## Phiên bản đã dùng hoặc đã kiểm tra (08/11/2026)

| Mục | Phiên bản / trạng thái | Cách xác minh |
|---|---|---|
| OWASP Top 10 | **2025** (A01 Broken Access Control ... A10 Mishandling of Exceptional Conditions) | trang `top10.owasp.org/2025` |
| OWASP ASVS | **5.0.0**, stable, 30/05/2025, 17 chương | `asvs.owasp.org`, cây thư mục repo |
| OWASP Password Storage | Argon2id m=19 MiB, t=2, p=1; bcrypt cost >= 10 | cheat sheet, đã đọc |
| OAuth 2.1 | Vẫn là Internet-Draft (draft-ietf-oauth-v2-1, bản -14/-15 năm 2026) | tìm kiếm; không xác nhận trực tiếp từ datatracker |
| SLSA | v1.2 | `slsa.dev/spec` |
| cosign | dòng 3.x (3.1.x theo gói phân phối) | gián tiếp, chưa xác minh từ upstream |
| Lab: Node.js | **v26.13.0** (image `node:lts-alpine`, dòng LTS tại 08/11/2026) | `node -v` trong container |
| Lab: npm | 11.20.0 | `npm -v` trong container |
| Lab: Express | **5.3.0** (chọn Express 5, lý do bên dưới) | `npm view express version`, `package-lock.json` |
| Lab: pg / helmet / zod | 8.23.1 / 8.3.0 / 4.6.7 | `npm view`, `package-lock.json` |
| Snippets: argon2 / jose / undici / pino | 0.45.2 / 6.2.15 / 8.12.4 / 10.4.0 | `npm view`, đã chạy trong `lab/snippets` |
| Lab: PostgreSQL | 18 (image `postgres:18`) | image có sẵn trên máy |
| TypeScript | 7.0.2 là `latest` trên npm (`npm view typescript`); lab **không** dùng `tsc`, Node 26 chạy thẳng file `.ts` (type stripping), nên không có bước type-check trong lab | `npm view typescript dist-tags` |
| Lab: Docker | 29.8.1 | `docker --version` |

Các khẳng định chưa xác minh đều được ghi rõ "chưa xác minh" tại chỗ trong chương. Đoạn code nào chưa chạy trong lab cũng được đánh dấu "chưa chạy trong lab" tại chỗ; code có ghi file nguồn trong `lab/` là code đã chạy thật. Tên option của thư viện có thể đổi giữa các major, hãy đối chiếu README đúng phiên bản bạn cài.

## Chạy lab

Yêu cầu: Docker. Không cần cài Node.js, npm hay PostgreSQL trên máy. Lab chỉ dùng container, network có tiền tố `bookcheck-sec-`, **không map port ra host**, và tự dọn khi xong.

```bash
cd lab
bash run.sh                                   # Git Bash / Linux / macOS; mất vài phút (mỗi lần gọi curl là một docker run)
# demo các đoạn code ở chương 6, 7, 10, 13 (argon2, jose, chống SSRF, pino):
docker run --rm --memory 512m -v "$PWD/snippets:/snippets:ro" node:lts-alpine sh /snippets/run.sh
```

(Trên Git Bash/Windows, thêm `MSYS_NO_PATHCONV=1` và dùng `$(pwd -W)` thay `$PWD`, như trong `run.sh`.)

Script `run.sh`: tạo network `bookcheck-sec-net`, chạy `bookcheck-sec-db` (`postgres:18`) và `bookcheck-sec-app` (`node:lts-alpine`; `app/start.sh` chép `lab/app` sang `/srv`, chạy `npm ci --omit=dev` theo `package-lock.json`, rồi `node server.ts`), tấn công bằng `curl` từ container `curlimages/curl` cùng network, rồi chạy `npm audit` trên `lab/audit/package.json` (xem `lab/audit/audit.sh`). Mỗi vulnerability có cặp endpoint `/vuln/...` (cố tình lỗi) và `/fixed/...`: SQL injection, stored XSS (kèm CSP), IDOR, mass assignment, prototype pollution. `run.sh` có `trap` xóa container và network. Thư mục `lab/app` được mount read-only nên `node_modules` nằm trong container, không để lại gì trên host. Nếu đổi dependency, tạo lại lockfile bằng `lab/app/lock.sh` (chạy trong container, mount `lab/app` có quyền ghi).

**Vì sao Express 5 mà không phải Fastify.** Cả hai đều ổn và còn được maintain (Fastify 5.12.8 tại 08/11/2026). Lab chọn Express 5.3.0 vì (1) nó là framework mà phần lớn developer Node đã biết nên đoạn code lỗi/đã sửa dễ đọc nhất; (2) Express 5 chuyển lỗi của handler `async` vào error-handling middleware, nên không cần bọc try/catch từng handler; (3) hệ sinh thái middleware bảo mật (helmet, `express-session`, `express-rate-limit`) tài liệu hóa theo Express. Các kỹ thuật trong sách (parameterized query, schema validation, CSP, policy) không phụ thuộc framework; với Fastify, thay `zod` bằng JSON Schema tích hợp và dùng `@fastify/helmet`.

**Vì sao chạy `.ts` trực tiếp.** Node 26 chạy file TypeScript bằng type stripping (chỉ bỏ type, không kiểm tra), nên lab không có bước build và không cần `tsx`/`ts-node`. Hệ quả: chỉ dùng cú pháp "erasable" (không `enum`, không parameter property), và lab **không** chạy `tsc`, tức type chưa được kiểm tra trong lần chạy này. Dự án thật nên thêm `tsc --noEmit` vào CI.

**Chỉ dùng cho mục đích học trên máy của chính bạn.** Ứng dụng trong `lab/app` cố tình có vulnerability, không bao giờ deploy. Không quét hay tấn công hệ thống không thuộc quyền của bạn.

Tùy chọn (chưa làm trong sách này): ZAP baseline scan (`ghcr.io/zaproxy/zaproxy:stable`, `zap-baseline.py -t http://bookcheck-sec-app:8080`) nhắm vào chính container lab trong cùng network. Image khá nặng nên bỏ qua.

## Đọc thêm

- OWASP Cheat Sheet Series (`cheatsheetseries.owasp.org`): hướng dẫn cài đặt cụ thể cho từng chủ đề, nguồn tham chiếu chính của sách này.
- OWASP ASVS 5.0 (`asvs.owasp.org`) và OWASP Top 10:2025 (`top10.owasp.org/2025`).
- PortSwigger Web Security Academy (`portswigger.net/web-security`): miễn phí, lab tấn công thực hành trên browser cho SQLi, XSS, CSRF, SSRF, JWT, OAuth...
- Andrew Hoffman, *Web Application Security* (O'Reilly): tổng quan tấn công và phòng thủ.
- Tanya Janca, *Alice and Bob Learn Application Security* (Wiley): quy trình bảo mật trong vòng đời phát triển, văn phong dễ đọc.
- Tài liệu Express (`expressjs.com`, mục Security best practices) và helmet (`helmetjs.github.io`); README của `jose`, `openid-client`, `argon2`, `zod` cho các chương 6-8 và 10.
