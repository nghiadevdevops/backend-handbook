# Lab: API đặt hàng

| File | Mục đích |
|---|---|
| `openapi/orders.yaml` | Spec OpenAPI 3.2.0: cursor pagination, error RFC 9457, Idempotency-Key, ETag/If-Match, webhook |
| `openapi/.spectral.yaml` | Ruleset Spectral (extends `spectral:oas` + 1 custom rule) |
| `lint.sh` | Chạy Redocly CLI và Spectral trong Docker |
| `api/index.ts` | API TypeScript + Fastify tối giản (idempotency, ETag, cursor, 409/412/422/428) |
| `api/package.json`, `api/package-lock.json`, `api/tsconfig.json` | Dependency (ghim phiên bản), cấu hình `tsc` |
| `api/start.sh`, `api/check.sh` | Chạy server trong container; kiểm kiểu bằng `tsc --noEmit` |
| `webhook/verify.ts`, `webhook/verify.test.ts` | Kiểm tra chữ ký Standard Webhooks (chương 12) bằng `node:crypto`, 8 test `node:test` |
| `run-api.sh` | Dựng server + gọi curl từ container khác, in transcript |
| `docker-compose.yml` | Chỉ server API (cùng cấu hình với `run-api.sh`), tùy chọn |
| `transcript.md` | Output thật của lần chạy `run-api.sh` |

## Chạy

Chỉ cần Docker (và bash). Không cài Node hay npm lên máy.

```bash
bash lint.sh                       # mong đợi: Redocly valid, Spectral 0 error
bash run-api.sh | tee transcript.md
# kiểm kiểu TypeScript (một lệnh docker):
docker run --rm -v "$PWD/api:/src:ro" node:26-alpine sh /src/check.sh
# test chữ ký webhook:
docker run --rm -v "$PWD/webhook:/src:ro" node:26-alpine sh /src/test.sh
```

`run-api.sh` tạo network `bookcheck-apits-net` và container `bookcheck-apits-server` (`node:26-alpine`, 256 MB). Container copy mã nguồn, chạy `npm ci --omit=dev` rồi `node index.ts` (Node 26 chạy TypeScript trực tiếp bằng type stripping, nên code chỉ dùng cú pháp TS "erasable": không `enum`, không `namespace`). Mỗi lệnh `curl` chạy trong một container `curlimages/curl` dùng một lần (`--rm`) cùng network. Không map port ra host. Khi script kết thúc (hoặc bị ngắt) nó xóa container và network.

Mỗi lần gọi curl là một `docker run`, nên cả kịch bản mất vài phút.

## Chọn công nghệ

- **Fastify 5** vì nhanh, ít phụ thuộc, hook/plugin rõ ràng và phổ biến; không cần framework nặng hơn cho 5 route.
- **Validate bằng JSON Schema (Ajv 8)** thay vì TypeBox/Zod: JSON Schema cùng dạng với schema trong `openapi/orders.yaml` nên dễ đối chiếu, và là thứ Fastify dùng sẵn. Lab gọi Ajv trực tiếp (không qua `schema:` của route) vì cần giữ raw body để băm fingerprint và phải nhả idempotency key khi validation lỗi. Nhược điểm: không suy ra type TS từ schema; dự án thật nên cân nhắc TypeBox (`@fastify/type-provider-typebox`) hoặc Zod để có type tự động.

## Lưu ý

- State của API nằm trong bộ nhớ process (mất khi xóa container). Node có một event loop nên mỗi khối đọc-sửa-ghi đồng bộ là nguyên tử; chỉ để minh họa, production dùng DB với unique constraint cho idempotency key.
- Header `X-Demo-Delay` chỉ có trong lab, dùng để giữ request ở state `processing` và quan sát `409`.
- Fingerprint payload là hash byte thô của body; production nên canonicalize JSON.
- Node trả reason phrase `Unprocessable Entity` cho 422; lab ghi đè thành `Unprocessable Content` (tên theo RFC 9110).
- Docker image `redocly/cli:latest` và `stoplight/spectral:latest` kéo bản mới nhất; phiên bản đã dùng: Redocly 2.76.0, Spectral 6.17.1. Spec OpenAPI không đổi trong lần chuyển sang TypeScript nên không lint lại.
