# Chương 5. Claude Code như nền tảng cho SDD

Chương này dùng các tính năng của Claude Code để làm SDD **không cần tool nào khác**: CLAUDE.md, plan mode, subagents, skills, hooks và plugins. Mọi chi tiết dưới đây lấy từ tài liệu chính thức tại `code.claude.com/docs` (đọc ngày 07/11/2026). Claude Code đổi nhanh; nếu lệnh khác với máy bạn, tài liệu là nguồn đúng.

## 1. Tình huống

Mỗi session Claude Code bắt đầu với context trống. Hôm qua bạn dặn "hủy trước 120 phút là miễn phí", hôm nay AI không biết. SDD cần chỗ lưu dài hạn các quy tắc làm việc và spec, và các cơ chế enforce để bắt AI tuân theo chúng.

## 2. Khái niệm và cơ chế

### 2.1. CLAUDE.md: memory do bạn viết

Theo tài liệu, CLAUDE.md là Markdown chứa instruction bền vững, được nạp vào đầu mỗi session:

| Scope | Vị trí |
|---|---|
| Người dùng (mọi dự án) | `~/.claude/CLAUDE.md` |
| Dự án (chia sẻ qua git) | `./CLAUDE.md` hoặc `./.claude/CLAUDE.md` |
| Cá nhân trong dự án | `./CLAUDE.local.md` (nên thêm vào `.gitignore`) |

Các điểm đáng nhớ:

- File ở thư mục cha được nạp khi khởi động; file ở thư mục con nạp khi Claude đọc hoặc sửa file trong thư mục đó.
- Có thể import file khác bằng cú pháp `@đường/dẫn` (ví dụ `@specs/glossary.md`). Cú pháp này bị bỏ qua trong code span và code block.
- `/init` sinh CLAUDE.md khởi đầu từ việc phân tích codebase; nếu đã có file thì đề xuất cải thiện.
- CLAUDE.md là *context*, không phải enforcement. Tài liệu nói rõ: muốn chặn một hành động bất kể Claude quyết gì, dùng hook `PreToolUse`.
- `AGENTS.md`: Claude Code đọc nó nếu repo không có `CLAUDE.md` nào (cần phiên bản từ 2.1.277 theo tài liệu). Nếu đã có cả hai, nó chỉ đọc `CLAUDE.md`; muốn dùng cả hai thì `CLAUDE.md` import `@AGENTS.md`.
- `.claude/rules/*.md` cho quy tắc theo nhóm file (có thể giới hạn bằng frontmatter `paths`).

Dự án mẫu có CLAUDE.md ngắn: `lab/roombook/CLAUDE.md`. Nó nói: cấu trúc thư mục, "đọc UC trước khi sửa code", "đổi hành vi thì sửa spec trước", `domain/` không import `adapters/`. Giữ ngắn và cụ thể; instruction dài và mơ hồ bị tuân thủ kém.

### 2.2. Plan mode: cho AI đọc và đề xuất, không sửa

Plan mode để Claude đọc file và đề xuất kế hoạch mà không sửa gì cho đến khi bạn duyệt. Bật bằng `Shift+Tab` trong session cho đến khi status bar hiện `plan mode on`, hoặc khởi động bằng:

```bash
claude --permission-mode plan
```

Trong SDD, plan mode hợp với bước "đọc spec và liệt kê điều chưa rõ", hoặc "đề xuất cách thêm UC-003 mà chưa viết dòng code nào".

### 2.3. Subagents: người làm việc chuyên biệt trong context riêng

Subagent là file Markdown có frontmatter YAML trong `.claude/agents/` (dự án) hoặc `~/.claude/agents/` (cá nhân). Chỉ `name` và `description` bắt buộc; có thêm `tools` (allowlist), `model` và nhiều trường khác. Mỗi subagent chạy trong context riêng và chỉ trả về bản tóm tắt. Bạn gọi bằng ngôn ngữ tự nhiên, bằng `@agent-<tên>`, hoặc để Claude tự giao dựa trên `description`.

Ví dụ một reviewer chỉ đọc, `.claude/agents/spec-reviewer.md`:

```markdown
---
name: spec-reviewer
description: Reviews use case specs in specs/use-cases for gaps and ambiguity. Use proactively after a UC is created or changed.
tools: Read, Glob, Grep
model: sonnet
---

Bạn là reviewer spec. Đọc UC được chỉ định, đối chiếu với specs/entities.md và
specs/glossary.md. Báo cáo: (1) dòng Exceptions chưa có AC, (2) AC thiếu số liệu,
(3) tên field lệch, (4) mâu thuẫn với BR. Không sửa file.
```

Vì không cấp `Edit`/`Write`, subagent này không thể sửa spec, chỉ báo cáo. Phân vai kiểu này (reviewer chỉ đọc, implementer có quyền sửa) là cách đơn giản để enforce "AI hỗ trợ, người quyết".

### 2.4. Skills: workflow đóng gói, gọi bằng `/tên`

Skill là thư mục có `SKILL.md` (frontmatter + hướng dẫn) tại `.claude/skills/<tên>/` (dự án) hoặc `~/.claude/skills/<tên>/`. Tài liệu nói custom command (`.claude/commands/`) đã được gộp vào skill; file cũ vẫn chạy. Trường frontmatter đáng dùng: `description` (Claude dựa vào đó để tự nạp), `disable-model-invocation: true` (chỉ chạy khi bạn gõ `/tên`), `argument-hint`, `allowed-tools`. Argument truyền vào nằm ở `$ARGUMENTS`.

Lab có skill `lab/roombook/.claude/skills/spec-review/SKILL.md`; gõ `/spec-review UC-001` để chạy rà soát năm điểm. Skill từ plugin được gọi dạng `/tên-plugin:tên-skill`; skill trong thư mục dự án của bạn thì không có tiền tố plugin.

### 2.5. Hooks: enforce bằng chương trình

Hooks là lệnh chạy tại các lifecycle event (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`...). Cấu hình trong `.claude/settings.json` (chia sẻ với team) hoặc `~/.claude/settings.json`. Cấu trúc ba level: event → nhóm matcher → handler. Exit code: `0` cho phép; `2` chặn (với event chặn được, `stderr` thành lý do cho Claude); exit code khác (kể cả 1) **không** chặn.

Ví dụ: sau mỗi lần sửa file, chạy script kiểm tra AC đều có test:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "sh scripts/check-ac-coverage.sh" }
        ]
      }
    ]
  }
}
```

Lưu ý: `PostToolUse` không chặn được (hành động đã xảy ra); nó chỉ feedback. Muốn *ngăn* AI sửa thư mục `specs/` ngoài quy trình, dùng `PreToolUse` với một script exit code 2. Cách script nhận dữ liệu tool (JSON qua stdin) xem trang hooks của tài liệu; tôi không lặp lại ở đây vì chưa chạy thử.

### 2.6. Plugins: đóng gói tất cả

Plugin là thư mục gồm skills, agents, hooks, MCP servers, kèm `.claude-plugin/plugin.json`. Cài từ marketplace (một catalog có `.claude-plugin/marketplace.json`):

```text
/plugin marketplace add <owner>/<repo>
/plugin install <tên-plugin>
```

AIUP phân phối theo cách này (chương 6). Một plugin đã bật có mô tả skill/agent nằm trong context mỗi lượt, tốn token; plugin chạy mã với quyền của bạn, nên đọc trước khi cài. Tài liệu có trang "Plugin security and trust".

## 3. Ví dụ: một vòng SDD hoàn toàn bằng Claude Code

1. Plan mode, prompt: "Đọc `specs/` và đề xuất UC-003 'Xem lịch phòng'. Liệt kê câu hỏi cho chị Hà." (chưa sửa file).
2. Bạn trả lời câu hỏi, thoát plan mode, bảo Claude viết `UC-003-view-room-schedule.md` theo mẫu phụ lục A.
3. `/spec-review UC-003` hoặc `@agent-spec-reviewer UC-003`. Sửa lỗ hổng.
4. Mở PR spec, người có thẩm quyền duyệt (chương 9).
5. Bảo Claude viết test acceptance từ AC, chạy (trong Docker), rồi mới viết code tới khi test pass.
6. Hook chạy `check-ac-coverage.sh` mỗi lần sửa.

## 4. Trade-off

- CLAUDE.md + skills + subagents miễn phí và nằm trong repo, nhưng *không có workflow được enforce*: tùy kỷ luật của team. Tool như Spec Kit hay OpenSpec đóng gói sẵn workflow (chương 6) với đổi lại là thêm một lớp phải học.
- Subagent tốt cho việc tách context (review, tìm kiếm); không phải lúc nào cũng nhanh hơn, vì có chi phí khởi tạo context.
- Plugin tiện nhưng thêm trust surface và chi phí context.

## 5. Cạm bẫy

- CLAUDE.md quá dài, chứa cả spec. Hãy để spec ở `specs/` và chỉ trỏ tới.
- Tưởng CLAUDE.md enforce được. Muốn enforce thì hook hoặc permission.
- Hook exit code 1 và nghĩ rằng nó chặn. Chỉ exit code 2 (trên event chặn được) mới chặn.
- Dùng cả `AGENTS.md` và `CLAUDE.md` mà không import nhau, rồi lệch nội dung.
- Tên skill trùng tên command cũ: skill thắng.

## 6. Tóm tắt

1. CLAUDE.md giữ quy tắc làm việc ngắn gọn; spec ở `specs/`.
2. Plan mode cho phép AI đề xuất trước khi sửa; bật bằng Shift+Tab hoặc `--permission-mode plan`.
3. Subagent (`.claude/agents/`) và skill (`.claude/skills/<tên>/SKILL.md`) đóng gói vai trò và quy trình.
4. Hook mới enforce được; exit code 2 chặn, exit code khác thì không.
5. Plugin gom tất cả, cài bằng `/plugin marketplace add` và `/plugin install`; tốn context và cần tin cậy.

## 7. Tự kiểm tra

1. Hai nơi đặt CLAUDE.md của dự án là gì?
2. Muốn Claude không bao giờ sửa `specs/` nếu chưa duyệt, nên dùng gì?
3. Skill từ plugin `abc` tên `xyz` được gọi thế nào?
4. Khi repo có cả `AGENTS.md` và `CLAUDE.md`, Claude Code đọc gì theo mặc định?

<details><summary>Đáp án</summary>

1. `./CLAUDE.md` hoặc `./.claude/CLAUDE.md`.
2. Hook `PreToolUse` (exit code 2) hoặc permission rule; CLAUDE.md chỉ là instruction.
3. `/abc:xyz`.
4. Chỉ `CLAUDE.md`; để dùng cả hai, `CLAUDE.md` import `@AGENTS.md`.
</details>
