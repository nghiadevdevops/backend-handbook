# API Design

A Vietnamese study edition on designing HTTP APIs, written for TypeScript/Node.js developers who already know basic HTTP and system design. The running example is an **orders API** (`orders`). The lab runs entirely in Docker.

## Who this book is for

Backend developers who design or review public or internal APIs and want a shared standard: correct HTTP semantics, a standard error format, idempotency, versioning, security, and documentation.

## Prerequisites

HTTP (methods, status codes, headers), JSON, REST at a basic level, and the ability to read YAML; knowing TypeScript/Node.js is an advantage (the chapters include tips for Fastify and the Node ecosystem, and the lab is written in TypeScript + Fastify).

## Contents

1. [Chapter 1. API design principles](01-design-principles.md)
2. [Chapter 2. HTTP semantics (RFC 9110)](02-http-semantics.md)
3. [Chapter 3. Designing resources, URLs, and non-CRUD actions](03-resources-urls-actions.md)
4. [Chapter 4. Pagination, filtering, sorting, field selection](04-pagination-filtering-sorting.md)
5. [Chapter 5. Error format: RFC 9457 Problem Details](05-error-format-rfc-9457.md)
6. [Chapter 6. Idempotency Key and safe retries](06-idempotency-key.md)
7. [Chapter 7. Versioning and API evolution](07-versioning-evolution.md)
8. [Chapter 8. Authentication and authorization for APIs](08-authn-authz.md)
9. [Chapter 9. Rate limiting, quotas, and HTTP caching](09-rate-limiting-caching.md)
10. [Chapter 10. OpenAPI: spec, design-first, lint, docs, mock](10-openapi.md)
11. [Chapter 11. REST, gRPC, GraphQL, webhooks, SSE/WebSocket: what to choose when](11-choosing-protocols.md)
12. [Chapter 12. Webhooks: signature, retry, idempotency, Standard Webhooks](12-webhooks.md)

## Versions and statuses checked (8/11/2026)

| Item | Status |
|---|---|
| RFC 9110 (HTTP Semantics), RFC 9111 (Caching) | current |
| RFC 9457 Problem Details (replaces RFC 7807) | current |
| RFC 9745 `Deprecation`, RFC 8594 `Sunset` | RFCs; 9745 published 3/2025 |
| RFC 10008 HTTP QUERY method | Proposed Standard (per the rfc-editor page) |
| `draft-ietf-httpapi-idempotency-key-header` | **-08**, 22/10/2026, Active I-D, not yet an RFC |
| `draft-ietf-httpapi-ratelimit-headers` | **-11**, 23/5/2026, Active I-D, not yet an RFC (expires 24/11/2026) |
| `draft-ietf-oauth-v2-1` (OAuth 2.1) | **-17**, 31/10/2026, not yet an RFC, not yet sent to the IESG |
| RFC 9700 (OAuth 2.0 Security BCP), RFC 9068, RFC 8725 | cited from memory, **official pages not re-checked in this writing pass** |
| OpenAPI Specification | **3.2.1** (10/9/2026); the lab spec declares `3.2.0` |
| Redocly CLI | 2.76.0 (run in Docker) |
| Spectral CLI | 6.17.1 (run in Docker) |
| Standard Webhooks | spec in the `standard-webhooks/standard-webhooks` repo (not an IETF standard) |
| Node.js in the lab | 26.13.0, LTS (image `node:26-alpine`, runs `.ts` directly via type stripping) |
| Fastify | 5.12.8 (npm, 8/11/2026) |
| TypeScript | 7.0.2 (used only for `tsc --noEmit` type checking) |
| Ajv (JSON Schema validation) | 8.20.0 |

The drafts may have changed since the date above; check the datatracker before relying on details.

## Running the labs

Requirements: Docker only (and bash). Nothing is installed on the host and no ports are mapped. Resources created are prefixed `bookcheck-apits-` and are removed automatically by the scripts.

```bash
cd lab
bash lint.sh      # lint openapi/orders.yaml bằng Redocly + Spectral (image chính thức)
bash run-api.sh   # dựng API TypeScript/Fastify + gọi bằng curl từ container khác, in transcript
```

See [lab/README.md](lab/README.md) for details. A sample result from a real run: [lab/transcript.md](lab/transcript.md).

## Further reading

- JJ Geewax, *API Design Patterns* (Manning, 2021).
- RFC 9110 *HTTP Semantics* and RFC 9457 *Problem Details for HTTP APIs* (rfc-editor.org).
- OpenAPI Specification (spec.openapis.org).
- Google API Improvement Proposals (aip.dev).
- Microsoft REST API Guidelines (github.com/microsoft/api-guidelines) and Zalando RESTful API Guidelines (opensource.zalando.com/restful-api-guidelines).
- Standard Webhooks (standardwebhooks.com).
