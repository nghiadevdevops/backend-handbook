# Spec-Driven Development: bản học lại (cập nhật 11/2026)

Bản học tự viết lại, bằng tiếng Việt, về Spec-Driven Development (SDD) với AI coding agent. Dự án ví dụ xuyên suốt: **RoomBook**, hệ thống đặt phòng họp nội bộ. Nội dung dựa trên tài liệu chính thức của các tool tại ngày 07/11/2026, không sao chép từ sách gốc.

## Ai nên đọc
Developer đã đi làm, đã dùng AI coding agent (Claude Code, Copilot...), muốn làm việc có kiểm soát thay vì "vibe coding", hoặc đang cân nhắc một tool SDD cho team.

## Cần biết trước
Git cơ bản, đọc được TypeScript (lab dùng TypeScript 5.9 trên Node.js, test bằng `node:test`), khái niệm automated test. Không cần biết DDD trước (chương 3 giải thích).

## Mục lục
1. [Vibe coding và SDD](01-vibe-coding-vs-sdd.md)
2. [Bốn tầng requirement: BR, UC, Entity, AC](02-four-requirement-layers.md)
3. [DDD và Hexagonal trong thời AI](03-ddd-and-hexagonal.md)
4. [Sáu nguyên tắc làm việc theo spec](04-six-principles.md)
5. [Claude Code cho SDD: CLAUDE.md, plan mode, subagents, skills, hooks, plugins](05-claude-code-for-sdd.md)
6. [So sánh công cụ: Spec Kit, OpenSpec, Kiro, AIUP, tự làm](06-sdd-tools-comparison.md)
7. [Greenfield](07-greenfield.md)
8. [Brownfield](08-brownfield.md)
9. [Vận hành team](09-team-operations.md)
10. [Khi nào không nên dùng SDD, đọc thêm](10-when-not-to-use-sdd.md)

Phụ lục: [A. Template](appendix-a-templates.md) · [B. PR template và git](appendix-b-pr-template-and-git.md) · [C. Cheatsheet lệnh](appendix-c-command-cheatsheet.md) · [D. Glossary](appendix-d-glossary.md)

## Phiên bản và ngày đã kiểm tra (07/11/2026)

| Thứ | Phiên bản / trạng thái | Nguồn |
|---|---|---|
| GitHub Spec Kit | v1.3.2 (phát hành 06/11/2026); Python 3.11+, `uv` | GitHub Releases API, README, `docs/quickstart.md`, `docs/integrations/claude.md` |
| OpenSpec | v1.16.1 (07/11/2026); Node.js 22.12.0+ khi cài qua package manager | GitHub Releases API, README, `docs/commands.md`, `concepts.md`, `customization.md`, `installation.md` |
| AIUP `aiup-core` | 3.13.0 (theo registry Tessl; chưa đối chiếu tag GitHub) | marketplace `ai-unified-process/marketplace`, trang Tessl |
| Kiro | tài liệu `kiro.dev/docs` (specs, steering, hooks); không ghi số phiên bản | kiro.dev |
| Claude Code | tài liệu `code.claude.com/docs` đọc 07/11/2026 (không tra số phiên bản CLI) | memory, sub-agents, skills, hooks, plugins, common-workflows |
| TypeScript và Node.js (lab) | `node:lts` (đã chạy với Node.js v26.13.0, chạy TS trực tiếp bằng type stripping, cần Node 22.18 trở lên), TypeScript 5.9.x, `@types/node` 24; test bằng `node:test` có sẵn, không thêm test framework | Đã chạy thật trong Docker |
| git (thử lệnh) | 2.47.3 trong image `ruby:3.3` | |

Các điểm **chưa xác minh** (ghi rõ trong chương liên quan): cấu trúc thư mục feature hiện hành của Spec Kit v1.3.2; đường dẫn `.kiro/specs/` từ nguồn chính thức; dạng gọi skill AIUP có namespace trong Claude Code; "sáu nguyên tắc" không phải của AIUP theo tài liệu tôi đọc được.

## Cách chạy lab
Lab nằm ở `lab/roombook/`. Không cài gì trên máy; chạy trong Docker. Cấu trúc: `specs/`, `src/` (`domain`, `application`, `ports`, `adapters`), `tests/acceptance/`.

Kiểm tra traceability, mỗi AC có test (chỉ cần `sh` và `grep`):

```bash
cd lab/roombook
docker run --rm -v "$PWD:/w:ro" -w /w node:lts sh scripts/check-ac-coverage.sh
```

Chạy typecheck, 13 test acceptance (`node:test`) và AC coverage một lượt. Đã chạy thật trong Docker (Node.js v26.13.0): `tsc --noEmit` đạt, 13/13 test pass, 13/13 AC có test. Mount có quyền ghi vì `npm install` tạo `node_modules` (xóa sau khi chạy):

```bash
docker run --rm -v "$PWD:/w" -w /w node:lts sh scripts/verify.sh
```

Trên Windows Git Bash thêm `MSYS_NO_PATHCONV=1` trước `docker` nếu đường dẫn bị đổi.

## Đọc thêm (đã kiểm tra tồn tại)
- Den Delimarsky, "Spec-driven development with AI: Get started with a new open source toolkit", GitHub Blog, 02/09/2025.
- Den Delimarsky, "Diving Into Spec-Driven Development With GitHub Spec Kit", Microsoft Developer Blog, 15/09/2025 (một bài blog).
- Tài liệu Spec Kit (`github.com/github/spec-kit`), OpenSpec (`github.com/Fission-AI/OpenSpec`), Kiro (`kiro.dev/docs`), Claude Code (`code.claude.com/docs`).
- Eric Evans, *Domain-Driven Design* (2003). Alistair Cockburn, "Hexagonal architecture" (bài viết khoảng 2005).
