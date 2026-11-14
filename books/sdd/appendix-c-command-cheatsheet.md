# Phụ lục C. Cheatsheet lệnh (đã đối chiếu tài liệu chính thức, 07/11/2026)

Ký hiệu: **[đã chạy]** nghĩa là tôi chạy thử trong Docker; **[tài liệu]** nghĩa là lấy từ tài liệu chính thức, chưa chạy vì cần cài tool. Lệnh trong agent (bắt đầu bằng `/`) gõ trong khung chat của agent, không gõ vào terminal.

## C.1. GitHub Spec Kit (v1.3.2, Python 3.11+, uv) [tài liệu]

Terminal:

```bash
uv tool install specify-cli
specify init my-project --integration claude        # dự án mới, Claude Code
specify integration install claude                  # thêm vào dự án đã có
specify init --here --force --integration claude    # init tại chỗ (tạo baseline/branch trước)
specify integration list | status | upgrade claude | switch <khóa> | use <khóa>
```

Trong Claude Code (skill, dấu gạch nối):

| Lệnh | Tham số | Ghi chú |
|---|---|---|
| `/speckit-constitution` | nguyên tắc dự án | một lần mỗi dự án |
| `/speckit-specify` | mô tả tự nhiên | cái gì và vì sao, chưa tech stack |
| `/speckit-clarify` | (tùy chọn) vùng cần làm rõ | trước plan |
| `/speckit-plan` | mô tả tech stack, architecture | không nhận mã UC |
| `/speckit-checklist` | không thấy trong tài liệu | |
| `/speckit-tasks` | không thấy trong tài liệu | |
| `/speckit-analyze` | không thấy trong tài liệu | chỉ đọc |
| `/speckit-implement` | không thấy trong tài liệu | chạy `tasks.md` |
| `/speckit-converge` | không thấy trong tài liệu | lặp implement và converge tới "Converged" |

Dạng gọi phụ thuộc agent: Claude Code `/speckit-...`; Codex `$speckit-...`; Kimi `/skill:...`. Feature đang hoạt động ghi ở `.specify/feature.json` (hoặc environment variable `SPECIFY_FEATURE_DIRECTORY`). Tùy chọn init cho Claude: `--integration-options="--no-model-invocation"` (chỉ chạy khi bạn gọi), `--integration-options="--events false"`.

## C.2. OpenSpec (v1.16.1, Node 22.12+ nếu cài qua package manager) [tài liệu]

```bash
npm install -g @fission-ai/openspec@latest     # hoặc curl/irm installer, hoặc brew install openspec
openspec init                                  # có --tools <danh-sách>
openspec update                                # làm mới skill/command sau nâng cấp
openspec config profile                        # chọn profile (core hoặc extended)
openspec --version
openspec version --check
```

| Profile | Lệnh trong agent |
|---|---|
| core (mặc định) | `/opsx:propose [tên-hoặc-mô-tả]`, `/opsx:explore [chủ đề]`, `/opsx:apply [tên-change]`, `/opsx:update [tên-change]`, `/opsx:sync [tên-change]`, `/opsx:archive [tên-change]` |
| extended | `/opsx:new [tên] [--schema <tên>]`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive [tên...]`, `/opsx:onboard` |

`/opsx:sync` gộp delta specs vào `openspec/specs/` (tùy chọn, change vẫn mở); `/opsx:archive` chuyển change vào `openspec/changes/archive/YYYY-MM-DD-<tên>/` và nhắc sync. `openspec/config.yaml` có các trường `schema`, `context`, `rules`. Một số tool dùng dạng khác (`/opsx-propose`, `$openspec-propose`).

## C.3. AIUP (`aiup-core` 3.13.0 theo registry Tessl) [tài liệu]

```text
/plugin marketplace add ai-unified-process/marketplace
/plugin install aiup-core
/plugin install aiup-spring-boot     # ví dụ plugin layer; cài theo stack của bạn
```

Skill `aiup-core`: `/requirements`, `/entity-model`, `/use-case-diagram`, `/business-process`, `/use-case-spec UC-001`, `/test-case`, `/stack`, `/use-case-implement`, `/use-case-test`, `/use-case-coverage`, `/test-case-implement`, `/test-case-coverage`, `/user-guide`, `/acceptance-protocol`, `/release-notes`, `/spec-review`, `/next`, `/open-questions`, `/architecture-decision`, `/reverse-engineer`. README hiển thị dạng không namespace; tài liệu Claude Code nói skill của plugin dùng `/tên-plugin:tên-skill`: nếu dạng ngắn không chạy, gõ `/` để xem tên thật. Plugin gộp `aiup-vaadin-jooq` và `aiup-angular-jpa` đã deprecated.

## C.4. Kiro [tài liệu]

Không có "lệnh" cho SDD trong terminal: dùng UI. Spec gồm `requirements.md` (hoặc `bugfix.md`), `design.md`, `tasks.md`. Steering: `.kiro/steering/` (`product.md`, `tech.md`, `structure.md`; chế độ `always`, `fileMatch`, `manual`, `auto`). Hooks: JSON trong `.kiro/hooks/`.

## C.5. Claude Code [tài liệu]

| Việc | Lệnh hoặc vị trí |
|---|---|
| Plan mode | `Shift+Tab` (lặp tới khi hiện `plan mode on`) hoặc `claude --permission-mode plan` |
| Sinh CLAUDE.md | `/init` |
| CLAUDE.md dự án | `./CLAUDE.md` hoặc `./.claude/CLAUDE.md`; cá nhân `./CLAUDE.local.md`; người dùng `~/.claude/CLAUDE.md` |
| Import file | `@specs/glossary.md` trong CLAUDE.md |
| Subagent | `.claude/agents/<tên>.md`, frontmatter `name`, `description`, `tools`, `model` |
| Gọi subagent | ngôn ngữ tự nhiên hoặc `@agent-<tên>` |
| Skill | `.claude/skills/<tên>/SKILL.md`, gọi `/<tên> <tham số>` |
| Hook | `.claude/settings.json`, key `hooks`; exit code 2 chặn (với event chặn được) |
| Plugin | `/plugin`, `/plugin marketplace add <owner>/<repo>`, `/plugin install <tên>` |
| Tiếp tục session | `claude --continue`, `claude --resume` |

## C.6. Shell và git (đã chạy trong container) [đã chạy]

```bash
# AC nào chưa có test (trong lab; chạy bằng sh trong container)
sh scripts/check-ac-coverage.sh

# commit liên quan một UC
git log --oneline --grep="UC-001"

# hotspot: file sửa nhiều nhất 1 năm qua. PHẢI có --format=
git log --since="1 year ago" --format= --name-only | sort | uniq -c | sort -rn | head -20

# domain/application không import adapters (rỗng = tốt)
grep -rn "adapters" src/domain src/application
```
