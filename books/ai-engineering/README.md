# AI Engineering

How to build applications that use LLMs in practice, written for backend developers (TypeScript/Node.js, SQL). Information status: **checked on 2026-11-07**. Content about models, prices and API versions changes fast; every figure carries a source and a check date, and where something could not be checked it is marked "chưa xác minh" (not verified).

## Who this book is for

Working developers who know TypeScript/Node.js, SQL and database indexes, who have already used AI to write code (for example through Spec-Driven Development), and who now want to **put an LLM into a product** rather than only use it as a tool.

## Prerequisites

- Basic TypeScript and Node.js (async/await, HTTP server, modules).
- SQL and an understanding of B-tree indexes (chapter 6 compares them with vector indexes).
- HTTP and JSON. No machine learning knowledge is needed.

## Running example

**ShopAssist**: an ordering system with an assistant for customer-support staff. The assistant answers from a policy knowledge base (the `kb_chunks` table), looks up orders with the `lookup_order` tool, stores conversations, and runs through a queue. Table, tool and TypeScript module names are consistent across chapters.

## Contents

1. [Chapter 1. How LLMs Work (at the Level a Developer Needs)](01-how-llms-work.md): tokens, context window, sampling, hallucination, cost and latency
2. [Chapter 2. The Model and Provider Landscape (checked 2026-11-07)](02-models-and-providers.md): snapshot as of 2026-11-07, selection criteria, routing by role
3. [Chapter 3. Prompt Engineering and Context Engineering](03-prompt-and-context-engineering.md): system prompt, few-shot, structured output, prompt caching
4. [Chapter 4. Tool Calling, Agent Loops and MCP](04-tool-calling-agents-mcp.md)
5. [Chapter 5. Embeddings and Semantic Search](05-embeddings-and-semantic-search.md)
6. [Chapter 6. Vector Indexes: Exact Search, HNSW, IVFFlat (pgvector)](06-vector-index-hnsw-ivfflat.md) (includes real lab results)
7. [Chapter 7. RAG: Chunking, Hybrid Search, Reranking, Citations](07-rag.md): chunking, hybrid search, reranking, citations, common failures
8. [Chapter 8. Evals: Measuring Quality Instead of Gut Feeling](08-evals.md)
9. [Chapter 9. Security for LLM Applications](09-llm-security.md): prompt injection, data leakage, least privilege, OWASP Top 10 for LLM
10. [Chapter 10. Operations: Cost, Caching, Rate Limits, Fallback, Streaming, Observability](10-operations.md)
11. [Chapter 11. Integrating into a Node.js/TypeScript Application](11-nodejs-typescript-integration.md) (the file keeps its old name so links do not break)

## Versions

Used or checked.

| Component | Version / status | Source (checked 2026-11-07) |
|---|---|---|
| PostgreSQL (lab) | 18 | image `pgvector/pgvector:0.8.7-pg18-trixie` |
| pgvector | 0.8.7 (actually run in the lab) | github.com/pgvector/pgvector, Docker Hub tags |
| MCP specification | 2026-07-28 (the `latest` version) | modelcontextprotocol.io/specification |
| OWASP Top 10 for LLM Applications | 2025 edition (LLM01 to LLM10) | genai.owasp.org/llm-top-10 |
| Anthropic API | header `anthropic-version: 2026-10-21` as the docs currently state; models `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | platform.claude.com/docs |
| OpenAI | Responses API; models `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna` | developers.openai.com/api/docs |
| Google | `gemini-4-argon`, `gemini-3.8-flash`..., `gemini-embedding-2` | aistudio.google.com/docs/models |
| OpenTelemetry GenAI semconv | status **Development** (not stable) | github.com/open-telemetry/semantic-conventions-genai |
| Node.js | v26.13.0 (image `node:lts-alpine` at check time) | hub.docker.com/_/node |
| TypeScript | 7.0.2 (ran `tsc --noEmit`) | npm registry |
| `@anthropic-ai/sdk` | 1.6.0 | npm registry |
| MCP TypeScript SDK | `@modelcontextprotocol/server` and `client` 2.4.0 (v2, spec 2026-07-28); `@modelcontextprotocol/sdk` 1.32.2 is the maintenance line, only up to spec 2025-11-25 | npm registry, package READMEs |
| `pg`, `pgvector` (npm), `zod`, `bullmq` | 8.23.1, 0.3.1, 4.6.7, 6.7.2 (BullMQ needs Redis, not actually run) | npm registry |
| `openai` (npm) | 7.53.0 (version checked only, the book has no runnable code for it) | npm registry |

Could not be verified and are marked as such in the book: Gemini pricing, the list and licenses of open-weight models (secondary sources only), the token-count attribute names of OTel GenAI, the JSON-schema output parameters of OpenAI.

## Running the labs

Requirement: Docker. **Nothing is installed on the host**; everything runs in containers prefixed `bookcheck-ai-` (SQL lab) or `bookcheck-aits-` (TypeScript lab); no ports are mapped.

```bash
cd lab
./run.sh          # ~ a few minutes: small demo, generates 50k vectors (see the note on 100k in chapter 6), measures exact/HNSW/IVFFlat; cleans up containers/volumes/networks itself
./run-ts.sh        # ~ a few minutes: tsc --noEmit + the demos that need no API key in a node:lts-alpine container, with a temporary PostgreSQL/pgvector; cleans up itself
```

- `run.sh` creates the network `bookcheck-ai-net`, the volume `bookcheck-ai-data` and the container `bookcheck-ai-pg` (limited with `--memory 2500m`), runs the files in `lab/sql/` and writes results to `lab/results.txt` and `lab/results-demo.txt`. When it finishes (even on error) the script removes those resources.
- On Windows use Git Bash (the script already sets `MSYS_NO_PATHCONV=1`).
- The TypeScript code in `lab/ts/` (the `@anthropic-ai/sdk` SDK, MCP, `pg` + `pgvector`, BullMQ) is checked by `run-ts.sh`. **The parts that call the real Claude API need an API key**, so they only go through `tsc --noEmit`, and no paid call is made; the parts that need no key (the eval runner with a fake `ask`, `AgentLoop` with a fake client, an MCP stdio server with a test client, pgvector queries, `lookup_order`, `POST /ask`) actually run. BullMQ needs Redis, so it only goes through `tsc --noEmit`.
- Timing results depend on the machine; relative comparisons between rows are more meaningful than absolute numbers.

## Further reading

- Chip Huyen, *AI Engineering: Building Applications with Foundation Models*, O'Reilly, 2025.
- Official documentation from Anthropic (platform.claude.com/docs: tool use, prompt caching, structured outputs) and OpenAI (developers.openai.com/api/docs: function calling).
- Model Context Protocol: modelcontextprotocol.io (specification and guides).
- The pgvector README: github.com/pgvector/pgvector. The original HNSW paper: Malkov and Yashunin, "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs" (IEEE TPAMI, 2020).
- OWASP GenAI Security Project: genai.owasp.org. The RRF paper: Cormack, Clarke and Buettcher, "Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods" (SIGIR 2009).
