# Chapter 10. OpenAPI: spec, design-first, lint, docs, mock

## 1. The problem

Tài liệu API nằm trong Confluence, lệch code từ ba sprint trước. Đội mobile viết model bằng tay và vỡ vì field đổi tên. **OpenAPI Specification (OAS)** là mô tả máy đọc được của HTTP API: từ một file sinh ra tài liệu, SDK, mock server, test và kiểm tra lint.

## 2. Versions (checked 11/2026)

- Phiên bản mới nhất trên spec.openapis.org: **OpenAPI 3.2.1 (10/9/2026)**, bản vá của 3.2.0 (3.2 phát hành năm 2025). Spec 3.2 hỗ trợ `webhooks` ở root level (có từ 3.1), method `query` (liên kết RFC 10008) và `additionalOperations` cho custom method.
- 3.1 căn chỉnh Schema Object với JSON Schema 2020-12 (`type: ["string","null"]` thay cho `nullable`). 3.0.x vẫn phổ biến ở công cụ cũ.
- Hỗ trợ công cụ có độ trễ: Redocly CLI hỗ trợ 3.2 (từ 2.3.0, 10/2025); với **Spectral** (`@stoplight/spectral-cli` 6.17.1 khi viết) tôi **chưa xác minh** mức hỗ trợ 3.2, xem kết quả lab bên dưới. Nếu công cụ bắt buộc của bạn chưa hỗ trợ, hạ về 3.1.x là lựa chọn hợp lý.

## 3. Structure of a spec

```yaml
openapi: 3.2.0
info: {title: Orders API, version: 1.0.0}
servers: [{url: https://api.example.com/v1}]
paths:
  /orders:
    get: {...}      # list, cursor pagination
    post: {...}     # create, Idempotency-Key
  /orders/{order_id}:
    get: {...}      # ETag, 304
    patch: {...}    # If-Match, 412, 428
  /orders/{order_id}/cancel:
    post: {...}
components:
  schemas: {Order, OrderList, NewOrder, Problem, ValidationProblem}
  parameters: {OrderId, IdempotencyKey, IfMatch, Limit, Cursor}
  responses: {...}     # reusable errors
  securitySchemes: {...}
```

Spec hoàn chỉnh cho API ví dụ nằm ở `lab/openapi/orders.yaml` (đã lint 0 lỗi, 0 cảnh báo với Redocly và Spectral). Những điểm đáng chú ý:

- `Problem` schema với media type `application/problem+json` (chương 5), tái sử dụng qua `components.responses`.
- Header `ETag`, `Location`, `Idempotent-Replayed` khai báo trong `headers` của response.
- `Idempotency-Key` và `If-Match` là `parameters` kiểu header có `required: true`.
- Ví dụ (`examples`) cho mỗi response, dùng chính payload của lab.
- `security`: Bearer JWT + scope.

## 4. Design-first or code-first

| | Design-first | Code-first |
|---|---|---|
| Quy trình | viết spec -> review -> sinh stub/mock -> cài đặt | viết code + annotation -> sinh spec |
| Ưu | review với consumer sớm; mock cho frontend làm song song; spec là contract | nhanh khởi đầu; spec luôn khớp code |
| Nhược | cần kỷ luật giữ code khớp spec | spec thường là "ảnh chụp" ngẫu nhiên; thiết kế ít được review; chi tiết mô tả nghèo |

Gợi ý: API công khai/đa team nên design-first, kiểm bằng **contract test** (mỗi response thật được validate theo schema trong spec) để code không trôi khỏi spec. Với Fastify/Node.js, các lựa chọn là viết YAML tay rồi kiểm bằng test, hoặc sinh spec từ schema của route bằng `@fastify/swagger` (9.9.3, bản 11/2026; cần kiểm tra mức hỗ trợ OAS 3.1/3.2 trước khi chọn vì chuẩn mới hơn plugin). Ngược chiều, có thể sinh type/client TypeScript từ spec: `openapi-typescript` (7.13.0, kèm `openapi-fetch`), `@hey-api/openapi-ts` (0.99.0, còn pre-1.0) hoặc `orval` (8.47.0). Các bản trên đều có release trong 2026 nhưng chưa kiểm tra từng cái hỗ trợ OAS 3.2 đến đâu, nên chạy thử với spec của bạn.

## 5. Lint

Lint spec để ép quy ước (chương 1) và bắt lỗi sớm.

- **Spectral** (Stoplight): custom ruleset (`.spectral.yaml`, `extends: ["spectral:oas"]`), chạy `spectral lint`.
- **Redocly CLI**: `redocly lint`, ruleset `recommended`, cấu hình `redocly.yaml`, có rule riêng 3.2; kiêm bundle, preview docs.
- Rule đáng bật: mọi operation có `operationId` duy nhất, `summary`, mô tả; có response lỗi; không có path chứa động từ (rule tự viết); tên field `snake_case`; mọi 4xx dùng `application/problem+json`.
- Đặt lint vào CI, chặn merge khi có lỗi.
- Phát hiện breaking change: so sánh spec giữa các branch với `oasdiff` (kiểm tra công cụ hiện hành).

### Lab results

Chạy `bash lab/lint.sh` (hai container tạm `bookcheck-api-redocly`, `bookcheck-api-spectral`, bind-mount read-only). Kết quả ngày 8/11/2026 với `orders.yaml` khai báo `openapi: 3.2.0`:

- **Redocly CLI 2.76.0** (`redocly/cli:latest`, `--extends recommended`): `Woohoo! Your API description is valid.`, 0 lỗi, 0 cảnh báo. Lần chạy đầu có 1 cảnh báo `no-server-example.com` (server trỏ example.com) và đã sửa.
- **Spectral 6.17.1** (`stoplight/spectral:latest`, ruleset `spectral:oas` + 1 rule tự viết `.spectral.yaml`): `No results with a severity of 'error' found!`, 0 lỗi. Lần đầu có 5 cảnh báo (thiếu `contact`, scope không khai báo, thiếu `description`) và đã sửa. Lưu ý: việc Spectral không báo lỗi không chứng minh nó hiểu hết cú pháp riêng của 3.2; Redocly mới là bên tuyên bố hỗ trợ 3.2.

## 6. Generating docs, mocks, and SDKs

- Tài liệu: Redoc/Redocly (`redocly build-docs`), Swagger UI, Scalar, Stoplight Elements.
- Mock: Prism (Stoplight) chạy mock từ spec, trả ví dụ đã khai báo; cho frontend làm song song.
- SDK/stub: OpenAPI Generator (nhiều ngôn ngữ, chất lượng khác nhau; luôn review code sinh ra).
- Test: schemathesis (property-based từ spec), Dredd (bản 14.1.0 phát hành 2/2023, ít hoạt động nên không khuyến nghị cho dự án mới); trong Node.js có thể validate response theo schema của spec bằng Ajv trong chính test (contract test tự viết).

## 7. Trade-offs

- Spec giàu chi tiết tốn công viết/giữ; đổi lại là single source of truth.
- Generator SDK tiện nhưng code sinh ra có thể xấu/khó tùy biến; một số API đáng viết SDK tay mỏng.
- Dùng 3.2 sớm: được tính năng mới, nhưng giới hạn công cụ.

## 8. Pitfalls

- Spec không được kiểm tra với hành vi thật nên trôi.
- Schema quá lỏng (`type: object` không có property) làm spec vô nghĩa.
- Quên khai báo lỗi và header.
- Trộn cú pháp 3.0 (`nullable`) vào tài liệu 3.1/3.2.
- `example` vi phạm chính schema của nó (lint sẽ bắt).
- `operationId` trùng/thiếu làm SDK sinh ra tên xấu.

## 9. Summary

- OAS 3.2.1 là bản mới nhất (9/2026); nhớ kiểm tra hỗ trợ của công cụ.
- Design-first + contract test cho API đa team.
- Lint ở CI (Spectral hoặc Redocly), sinh docs/mock từ cùng file spec.

## 10. Self-check questions

1. Khác biệt chính giữa nullable ở 3.0 và 3.1?
2. Vì sao design-first cần contract test?
3. Mock từ spec giúp ai?
4. Nên đặt lint ở đâu trong quy trình?

<details><summary>Answer</summary>

1. 3.0: `nullable: true`; 3.1+: `type: [X, "null"]` theo JSON Schema 2020-12.
2. Để code không lệch khỏi spec theo thời gian.
3. Frontend/mobile làm song song trước khi backend xong.
4. Ở CI, chặn merge khi spec vi phạm.
</details>
