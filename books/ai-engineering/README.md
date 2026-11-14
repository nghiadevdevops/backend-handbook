# AI Engineering cho developer

Cách xây ứng dụng dùng LLM trong thực tế, viết cho developer backend (TypeScript/Node.js, SQL). Trạng thái thông tin: **tra ngày 07/11/2026**. Nội dung về model, giá, phiên bản API thay đổi nhanh; mọi con số có gắn nguồn và ngày tra, nơi không tra được thì ghi "chưa xác minh".

## Ai nên đọc

Developer đã đi làm, biết TypeScript/Node.js, SQL và index cơ sở dữ liệu, đã dùng AI để code (ví dụ theo Spec-Driven Development), nay muốn **đưa LLM vào sản phẩm** thay vì chỉ dùng nó như công cụ.

## Kiến thức cần có

- TypeScript và Node.js cơ bản (async/await, HTTP server, module).
- SQL và hiểu B-tree index (chương 6 so sánh với vector index).
- HTTP và JSON. Không cần biết machine learning.

## Ví dụ xuyên suốt

**ShopAssist**: hệ thống đặt hàng có trợ lý cho nhân viên chăm sóc khách hàng. Trợ lý trả lời theo kho chính sách (bảng `kb_chunks`), tra đơn hàng bằng tool `lookup_order`, lưu hội thoại, chạy qua queue. Tên bảng, tool và module TypeScript thống nhất giữa các chương.

## Mục lục

1. [LLM hoạt động thế nào](01-how-llms-work.md): token, context window, sampling, hallucination, chi phí và latency
2. [Model và nhà cung cấp](02-models-and-providers.md): ảnh chụp 07/11/2026, tiêu chí chọn, routing theo vai trò
3. [Prompt và context engineering](03-prompt-and-context-engineering.md): system prompt, few-shot, structured output, prompt caching
4. [Tool calling, agent loop và MCP](04-tool-calling-agents-mcp.md)
5. [Embeddings và semantic search](05-embeddings-and-semantic-search.md)
6. [Vector index: exact, HNSW, IVFFlat](06-vector-index-hnsw-ivfflat.md) (có kết quả lab thật)
7. [RAG](07-rag.md): chunking, hybrid search, reranking, citation, lỗi thường gặp
8. [Evals](08-evals.md)
9. [Security](09-llm-security.md): prompt injection, data leakage, least privilege, OWASP Top 10 for LLM
10. [Vận hành](10-operations.md): chi phí, cache, rate limit, fallback, streaming, observability
11. [Tích hợp vào ứng dụng Node.js/TypeScript](11-nodejs-typescript-integration.md) (file giữ tên cũ để không vỡ link)

## Phiên bản đã dùng hoặc đã kiểm tra

| Thành phần | Phiên bản / trạng thái | Nguồn (tra 07/11/2026) |
|---|---|---|
| PostgreSQL (lab) | 18 | image `pgvector/pgvector:0.8.7-pg18-trixie` |
| pgvector | 0.8.7 (chạy thật trong lab) | github.com/pgvector/pgvector, Docker Hub tags |
| MCP specification | 2026-07-28 (bản `latest`) | modelcontextprotocol.io/specification |
| OWASP Top 10 for LLM Applications | bản 2025 (LLM01 đến LLM10) | genai.owasp.org/llm-top-10 |
| Anthropic API | header `anthropic-version: 2026-10-21` như docs đang ghi; model `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | platform.claude.com/docs |
| OpenAI | Responses API; model `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` | developers.openai.com/api/docs |
| Google | `gemini-4-argon`, `gemini-3.8-flash`..., `gemini-embedding-2` | aistudio.google.com/docs/models |
| OpenTelemetry GenAI semconv | trạng thái **Development** (chưa ổn định) | github.com/open-telemetry/semantic-conventions-genai |
| Node.js | v26.13.0 (image `node:lts-alpine` lúc tra) | hub.docker.com/_/node |
| TypeScript | 7.0.2 (chạy `tsc --noEmit`) | npm registry |
| `@anthropic-ai/sdk` | 1.6.0 | npm registry |
| MCP TypeScript SDK | `@modelcontextprotocol/server` và `client` 2.4.0 (v2, spec 2026-07-28); `@modelcontextprotocol/sdk` 1.32.2 là dòng maintenance, chỉ tới spec 2025-11-25 | npm registry, README các package |
| `pg`, `pgvector` (npm), `zod`, `bullmq` | 8.23.1, 0.3.1, 4.6.7, 6.7.2 (BullMQ cần Redis, chưa chạy thật) | npm registry |
| `openai` (npm) | 7.53.0 (chỉ tra phiên bản, sách không có mã chạy) | npm registry |

Không xác minh được và đã ghi rõ trong sách: giá Gemini, danh sách và license model open-weight (chỉ có nguồn thứ cấp), tên thuộc tính đếm token của OTel GenAI, tham số JSON-schema output của OpenAI.

## Cách chạy lab

Yêu cầu: Docker. **Không cài gì lên máy host**, mọi thứ chạy trong container có tiền tố `bookcheck-ai-` (lab SQL) hoặc `bookcheck-aits-` (lab TypeScript); không map port.

```bash
cd lab
./run.sh          # ~ vài phút: demo nhỏ, sinh 50k vector (xem ghi chú về 100k trong chương 6), đo exact/HNSW/IVFFlat; tự dọn container/volume/network
./run-ts.sh        # ~ vài phút: tsc --noEmit + các demo không cần API key trong container node:lts-alpine, kèm PostgreSQL/pgvector tạm thời; tự dọn
```

- `run.sh` tạo network `bookcheck-ai-net`, volume `bookcheck-ai-data`, container `bookcheck-ai-pg` (giới hạn `--memory 2500m`), chạy các file trong `lab/sql/` và ghi kết quả ra `lab/results.txt` và `lab/results-demo.txt`. Khi kết thúc (kể cả lỗi) script xóa các tài nguyên đó.
- Trên Windows dùng Git Bash (script đã đặt `MSYS_NO_PATHCONV=1`).
- Mã TypeScript trong `lab/ts/` (SDK `@anthropic-ai/sdk`, MCP, `pg` + `pgvector`, BullMQ) được kiểm bằng `run-ts.sh`. **Phần gọi API Claude thật cần API key** nên chỉ qua `tsc --noEmit`, không có lời gọi trả phí nào được thực hiện; phần không cần key (eval runner với `ask` giả, `AgentLoop` với client giả, MCP server stdio cùng client test, truy vấn pgvector, `lookup_order`, `POST /ask`) chạy thật. BullMQ cần Redis nên chỉ qua `tsc --noEmit`.
- Kết quả thời gian phụ thuộc máy; so sánh tương đối giữa các dòng có ý nghĩa hơn con số tuyệt đối.

## Đọc thêm

- Chip Huyen, *AI Engineering: Building Applications with Foundation Models*, O'Reilly, 2025.
- Tài liệu chính thức của Anthropic (platform.claude.com/docs: tool use, prompt caching, structured outputs) và OpenAI (developers.openai.com/api/docs: function calling).
- Model Context Protocol: modelcontextprotocol.io (specification và hướng dẫn).
- README của pgvector: github.com/pgvector/pgvector. Bài báo gốc HNSW: Malkov và Yashunin, "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs" (IEEE TPAMI, 2020).
- OWASP GenAI Security Project: genai.owasp.org. Bài báo RRF: Cormack, Clarke và Buettcher, "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods" (SIGIR 2009).
