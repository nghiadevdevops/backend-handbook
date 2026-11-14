# Chapter 10. Security and Authorization

> Cập nhật: 2026-11-07.

## 10.1 Security in system design

Trong phỏng vấn, security không cần đi sâu cryptography; cần cho thấy bạn *có nghĩ đến* ba câu hỏi: **ai đang gọi (authentication)? họ được làm gì (authorization)? dữ liệu có bị lộ/sửa trên đường đi hoặc khi lưu không (protection)?** Nguyên tắc nền: **least privilege**, **defense in depth**, **secure by default**, **không tin dữ liệu từ client**.

## 10.2 Authentication

- **Password**: không bao giờ lưu rõ. Lưu bằng hash function *chậm có salt*, dành riêng cho password: **Argon2id** (khuyến nghị hiện nay của OWASP), hoặc scrypt/bcrypt. Không dùng SHA-256 thô hay MD5. Chống brute force bằng rate limit, account lockout, breached password check.
- **MFA** (multi-factor authentication): thêm second factor (TOTP, push notification, hardware key). **Passkeys/WebAuthn** dùng public key gắn với thiết bị, chống phishing tốt hơn password.
- **Session cookie**: server giữ session (ID ngẫu nhiên → dữ liệu trong Redis/DB). Dễ revoke, hợp web truyền thống.
- **Token (JWT)**: token self-contained, signed; server không cần tra cứu mỗi lần → dễ scale, nhưng khó revoke trước hạn. Dùng **access token ngắn hạn** (phút) + **refresh token** (có thể revoke, rotate). Kiểm tra signature, `exp`, `aud`, `iss`; từ chối algorithm `none`; không đưa dữ liệu nhạy cảm vào payload (JWT chỉ được *signed*, thường không được *encrypted*).
- **OAuth 2.0 / OpenID Connect (OIDC)**: OAuth 2.0 là khung *delegated authorization* ("cho ứng dụng A đọc lịch của tôi"); OIDC thêm layer *authentication* (ID token). Flow khuyến nghị cho ứng dụng web/mobile public client: **Authorization Code + PKCE**.
- **Service-to-service**: mTLS, token ngắn hạn do identity system cấp (workload identity), tránh key dài hạn trong code.

## 10.3 Authorization

- **RBAC** (role-based): user → role → permission. Đơn giản, dễ audit; dễ phình số role.
- **ABAC** (attribute-based): quyết định dựa trên attribute của user, resource, context ("chỉ bác sĩ của khoa này, trong giờ làm việc"). Linh hoạt, phức tạp hơn.
- **ReBAC** (relationship-based, kiểu Zanzibar): "A là chủ sở hữu thư mục chứa tài liệu này".
- Kiểm tra permission **ở server cho mỗi request, trên từng resource**. Lỗi phổ biến nhất là **IDOR/BOLA**: `GET /orders/42` chỉ kiểm tra đã login, không kiểm tra đơn 42 thuộc về người gọi.
- Tập trung logic authorization (policy engine hoặc một layer chung); deny by default.

## 10.4 API security and classic web vulnerabilities

| Threat | Mechanism | Main defense |
|---|---|---|
| **SQL injection** | Dữ liệu người dùng bị hiểu thành câu lệnh SQL | **Parameterized query / prepared statement** (chủ yếu); ORM dùng đúng cách; DB permission tối thiểu. Escape thủ công và blacklist chỉ là lớp phụ |
| **XSS** | Malicious script chạy trong trang | **Output encoding theo ngữ cảnh** (HTML, thuộc tính, JS, URL); **Content-Security-Policy (CSP)**; cookie `HttpOnly`; framework tự escape |
| **CSRF** | Trang khác khiến browser của nạn nhân gửi request kèm cookie | **SameSite cookie** (`Lax`/`Strict`), **CSRF token**, kiểm tra `Origin`/`Referer` |
| **SSRF** | Server bị lừa gọi URL nội bộ | Allowlist đích, chặn IP range nội bộ/metadata |
| **Broken access control (IDOR)** | Thiếu kiểm tra permission trên resource | Mục 10.3 |
| **Brute force / credential stuffing / DDoS** | Thử hàng loạt, làm ngập | Rate limit (chương 9), WAF, CAPTCHA, CDN chống DDoS |
| **Secret leak** | API key trong repo | Secret manager, key rotation, secret scanning |

### Same-origin policy, CORS and CSRF: don't confuse them

- **Same-Origin Policy (SOP)** của browser: script ở origin A *không được đọc response* của origin B. SOP **chặn việc ĐỌC**, **không chặn việc GỬI** request; ví dụ một form `<form method=POST action="https://bank.example/transfer">` ở trang khác vẫn gửi đi, kèm cookie của bank (nếu cookie được phép gửi cross-site). Chính vì vậy CSRF tồn tại.
- **CORS** là cơ chế để server *nới lỏng* SOP một cách có chọn lọc (cho phép origin cụ thể đọc response). CORS **không phải** cơ chế chống CSRF và không thay thế CSRF protection; cấu hình CORS rộng (`*` kèm credentials, phản chiếu mọi `Origin`) còn *mở thêm* rủi ro.
- Phòng CSRF: `SameSite` cookie (browser hiện đại mặc định `Lax` cho cookie không khai báo), CSRF token (synchronizer hoặc double-submit), kiểm tra `Origin`, và không thay đổi state bằng GET.

## 10.5 Data protection

- **In transit**: TLS. Tối thiểu **TLS 1.2**; ưu tiên **TLS 1.3** (RFC 8446). TLS 1.0 và 1.1 đã bị đưa vào status Historic (RFC 8996, 2021) nên phải tắt. Bật **HSTS** để browser luôn dùng HTTPS. Giữa các service nội bộ nên dùng mTLS.
- **At rest**: encrypt disk/database/object storage; field-level encryption cho dữ liệu cực nhạy (số thẻ, giấy tờ). Dùng **KMS** và **envelope encryption** (data key encrypt nội dung; master key trong KMS encrypt data key).
- **Hai họ mật mã khác nhau**:
  - **Symmetric** (cùng một key để encrypt/decrypt): **AES-GCM**, ChaCha20-Poly1305. Nhanh, dùng cho dữ liệu lớn. Là *AEAD* (confidentiality + integrity).
  - **Public-key/asymmetric**: **RSA** và **ECC** (ECDSA, ECDH, Ed25519, X25519). Dùng cho digital signature, key exchange, certificate. **ECC là public-key cryptography, không phải cipher symmetric** (không đặt cạnh AES-GCM như hai lựa chọn cùng loại). Thực tế TLS dùng public-key để negotiate session key rồi dùng symmetric cipher để encrypt dữ liệu.
- **Hash**: SHA-256 cho toàn vẹn; không dùng cho password (mục 10.2). **HMAC** để message authentication.
- **Personal data (PII)**: data minimization, mask trong log, retention policy, tuân thủ quy định (GDPR, luật bảo vệ dữ liệu cá nhân địa phương).
- Các chuẩn post-quantum cryptography đang được triển khai dần trong key exchange của TLS; nếu cần nhắc trong phỏng vấn hãy nói ở mức "đang chuyển đổi" và kiểm tra trạng thái hiện tại.

## 10.6 Secure cookies

`Set-Cookie: sid=...; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=...`
- `Secure`: chỉ gửi qua HTTPS. `HttpOnly`: JavaScript không đọc được (giảm impact của XSS). `SameSite`: hạn chế gửi cross-site (giảm CSRF). Tiền tố `__Host-` ép `Secure`, `Path=/`, không có `Domain`.

## 10.7 Design example: login for web + mobile

1. Password hash Argon2id; hỗ trợ passkeys và TOTP.
2. Login thành công → access token JWT 10 phút + rotating refresh token, lưu hash trong DB để revoke.
3. Web: refresh token trong cookie `HttpOnly; Secure; SameSite=Lax`; mobile: lưu trong OS keystore.
4. API gateway kiểm tra signature token, rate limit theo user/IP; từng service kiểm tra permission theo resource.
5. Mọi thứ qua TLS 1.2+/1.3; dữ liệu nhạy cảm field-level encryption với key trong KMS.
6. Ghi log login/đổi permission (audit) và alert bất thường.
Trade-off: token ngắn hạn tăng tần suất refresh (load), đổi lại giảm window rủi ro khi lộ token.

## 10.8 What to say in an interview

- "Authentication tập trung ở gateway/IdP; authorization kiểm tra ở service cho từng resource, deny by default."
- "Chống SQL injection bằng parameterized query; XSS bằng output encoding theo ngữ cảnh và CSP; CSRF bằng SameSite và token, CORS không thay được CSRF protection."
- "TLS 1.2 trở lên, ưu tiên 1.3; dữ liệu nhạy cảm encrypt at rest với key quản lý bởi KMS."
- "Password hash bằng Argon2id/bcrypt, không bao giờ lưu rõ."

## 10.9 Pitfalls

- Chỉ kiểm tra "đã login" mà không kiểm tra permission trên resource (IDOR).
- Dùng CORS thay cho CSRF protection; đặt `Access-Control-Allow-Origin: *` cùng credentials.
- Dựa vào escape/blacklist để chống SQLi thay vì parameterized query.
- Nhầm ECC là symmetric cipher; nhầm hash với encryption.
- Lưu JWT dài hạn ở `localStorage` (XSS đọc được), không có cơ chế revoke.
- Đưa dữ liệu nhạy cảm vào JWT payload.
- Còn cho phép TLS 1.0/1.1.
- Ghi password/token vào log.

## 10.10 Summary

1. Phân biệt authentication, authorization, data protection.
2. Password: Argon2id/bcrypt + MFA/passkeys; token ngắn hạn + refresh.
3. SQLi → parameterized query; XSS → output encoding + CSP; CSRF → SameSite + token; SOP chặn đọc chứ không chặn gửi.
4. TLS ≥ 1.2 (ưu tiên 1.3); AES-GCM là symmetric, ECC/RSA là public-key.
5. Kiểm tra permission trên từng resource, deny by default.

## 10.11 Self-check questions

1. Vì sao CORS không thay được CSRF protection?
2. Biện pháp chính chống SQL injection là gì?
3. AES-GCM và ECC khác loại nhau thế nào?
4. IDOR là gì và phòng thế nào?
5. Version TLS tối thiểu nên chấp nhận hiện nay?

<details>
<summary>Answer</summary>

1. SOP chỉ chặn việc đọc response, không chặn việc gửi request; CSRF khai thác việc request cross-site vẫn được gửi kèm cookie. CORS chỉ nới việc đọc; cần SameSite cookie và CSRF token.
2. Parameterized query/prepared statement (tách code và data), cộng DB permission tối thiểu và validate đầu vào.
3. AES-GCM: symmetric cipher (một key), dùng encrypt dữ liệu. ECC: public-key cryptography (key pair), dùng cho signature, key exchange.
4. Thiếu kiểm tra permission trên từng resource (truy cập đối tượng bằng ID đoán được). Phòng bằng kiểm tra permission phía server cho mỗi request trên từng đối tượng, deny by default.
5. TLS 1.2; ưu tiên TLS 1.3. TLS 1.0/1.1 đã bị deprecate (RFC 8996).

</details>

## Sources consulted

- RFC 8996 (deprecate TLS 1.0 và 1.1): https://rfc-editor.org/rfc/rfc8996.html
- RFC 8446 (TLS 1.3), OWASP khuyến nghị Argon2id, hành vi SameSite mặc định: kiến thức chuẩn, chưa tra lại trang trong phiên này (xem điểm chưa chắc).
