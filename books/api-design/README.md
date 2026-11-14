# API Design cho developer backend

Bản học tiếng Việt về thiết kế API HTTP, viết cho developer TypeScript/Node.js đã biết HTTP cơ bản và system design. Ví dụ xuyên suốt: **API đặt hàng** (`orders`). Lab chạy hoàn toàn trong Docker.

## Ai nên đọc

Developer backend đang thiết kế hoặc review API công khai/nội bộ, muốn có tiêu chuẩn chung: HTTP semantics đúng, error format chuẩn, idempotency, versioning, security và tài liệu.

## Kiến thức cần có

HTTP (method, status, header), JSON, REST ở mức cơ bản, biết đọc YAML; biết TypeScript/Node.js là lợi thế (các chương có gợi ý cho Fastify và hệ sinh thái Node, lab viết bằng TypeScript + Fastify).

## Mục lục

1. [Nguyên tắc thiết kế API](01-design-principles.md)
2. [HTTP semantics (RFC 9110): method, status, header, ETag/If-Match](02-http-semantics.md)
3. [Resource, URL và action không phải CRUD](03-resources-urls-actions.md)
4. [Pagination, filtering, sorting, field selection](04-pagination-filtering-sorting.md)
5. [Error format RFC 9457](05-error-format-rfc-9457.md)
6. [Idempotency Key và retry an toàn](06-idempotency-key.md)
7. [Versioning và API evolution, Deprecation/Sunset](07-versioning-evolution.md)
8. [Authn/authz: OAuth 2.0/2.1, OIDC, API key, JWT](08-authn-authz.md)
9. [Rate limiting, quota, caching HTTP](09-rate-limiting-caching.md)
10. [OpenAPI: design-first, lint, docs, mock](10-openapi.md)
11. [REST, gRPC, GraphQL, webhook, SSE, WebSocket](11-choosing-protocols.md)
12. [Webhooks: HMAC, retry, Standard Webhooks](12-webhooks.md)

## Phiên bản và status đã kiểm tra (8/11/2026)

| Mục | Status |
|---|---|
| RFC 9110 (HTTP Semantics), RFC 9111 (Caching) | hiện hành |
| RFC 9457 Problem Details (thay RFC 7807) | hiện hành |
| RFC 9745 `Deprecation`, RFC 8594 `Sunset` | RFC; 9745 ban hành 3/2025 |
| RFC 10008 HTTP QUERY method | Proposed Standard (theo trang rfc-editor) |
| `draft-ietf-httpapi-idempotency-key-header` | **-08**, 22/10/2026, Active I-D, chưa là RFC |
| `draft-ietf-httpapi-ratelimit-headers` | **-11**, 23/5/2026, Active I-D, chưa là RFC (hết hạn 24/11/2026) |
| `draft-ietf-oauth-v2-1` (OAuth 2.1) | **-17**, 31/10/2026, chưa là RFC, chưa gửi IESG |
| RFC 9700 (OAuth 2.0 Security BCP), RFC 9068, RFC 8725 | nhắc theo hiểu biết, **chưa tra lại trang chính thức trong lần viết này** |
| OpenAPI Specification | **3.2.1** (10/9/2026); spec lab khai báo `3.2.0` |
| Redocly CLI | 2.76.0 (đã chạy trong Docker) |
| Spectral CLI | 6.17.1 (đã chạy trong Docker) |
| Standard Webhooks | spec trong repo `standard-webhooks/standard-webhooks` (không phải chuẩn IETF) |
| Node.js trong lab | 26.13.0, LTS (image `node:26-alpine`, chạy `.ts` trực tiếp bằng type stripping) |
| Fastify | 5.12.8 (npm, 8/11/2026) |
| TypeScript | 7.0.2 (chỉ dùng `tsc --noEmit` để kiểm kiểu) |
| Ajv (validate JSON Schema) | 8.20.0 |

Các draft có thể đã đổi sau thời điểm trên; kiểm tra datatracker trước khi dựa vào chi tiết.

## Chạy lab

Yêu cầu: chỉ Docker (và bash). Không cài gì lên host, không map port. Resource tạo ra có tiền tố `bookcheck-apits-` và được script tự xóa.

```bash
cd lab
bash lint.sh      # lint openapi/orders.yaml bằng Redocly + Spectral (image chính thức)
bash run-api.sh   # dựng API TypeScript/Fastify + gọi bằng curl từ container khác, in transcript
```

Chi tiết xem [lab/README.md](lab/README.md). Kết quả mẫu đã chạy thật: [lab/transcript.md](lab/transcript.md).

## Đọc thêm

- JJ Geewax, *API Design Patterns* (Manning, 2021).
- RFC 9110 *HTTP Semantics* và RFC 9457 *Problem Details for HTTP APIs* (rfc-editor.org).
- OpenAPI Specification (spec.openapis.org).
- Google API Improvement Proposals (aip.dev).
- Microsoft REST API Guidelines (github.com/microsoft/api-guidelines) và Zalando RESTful API Guidelines (opensource.zalando.com/restful-api-guidelines).
- Standard Webhooks (standardwebhooks.com).
