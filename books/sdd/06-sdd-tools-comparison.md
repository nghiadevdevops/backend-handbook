# Chương 6. Các công cụ SDD: Spec Kit, OpenSpec, Kiro, AIUP và tự làm

Thông tin dưới đây lấy từ README, tài liệu và release notes chính thức, đọc ngày **07/11/2026**. Các tool này đổi rất nhanh (Spec Kit đã đổi tiền tố và kiểu lệnh so với bản lúc sách gốc được viết). Mọi chỗ tôi không xác nhận được từ tài liệu đều ghi "chưa xác minh".

## 1. Tình huống

Team quyết định làm SDD và bị hỏi: "cài cái gì?". Có bốn lựa chọn nổi bật và một lựa chọn "không cài gì". Chọn sai thì hoặc mất tuần học tool, hoặc tự chế lại bánh xe.

## 2. Từng công cụ

### 2.1. GitHub Spec Kit

- **Là gì:** bộ công cụ open source của GitHub: CLI `specify` cộng template, thêm "skills" vào coding agent của bạn. Release mới nhất đã kiểm tra: **v1.3.2 (06/11/2026)**. Yêu cầu: Python 3.11+ và `uv`.
- **Cài:** `uv tool install specify-cli`, rồi `specify init <tên-dự-án> --integration <khóa-agent>`. Với Claude Code key là `claude`: `specify init my-project --integration claude`. Với dự án đã có: `specify integration install claude`, hoặc `specify init --here --force --integration <khóa>` (tài liệu khuyên tạo baseline và branch trước vì `--force` có thể ghi đè file).
- **Lệnh trong Claude Code:** skill nằm ở `.claude/skills/speckit-<lệnh>/SKILL.md` và gọi bằng **gạch nối**: `/speckit-specify`, `/speckit-plan`... Tài liệu Claude không nhắc dạng `/speckit.specify` (dấu chấm). Dạng chấm xuất hiện trong một số tài liệu cũ hơn của chính repo và tùy agent; hãy dùng dạng agent của bạn hiển thị. Codex dùng tiền tố `$`, Kimi dùng `/skill:`.
- **Các lệnh (tài liệu quickstart):**

| Lệnh | Nhận gì | Làm gì |
|---|---|---|
| `/speckit-constitution` | nguyên tắc dự án (văn bản tự do) | đặt nguyên tắc để các bước sau đối chiếu; chạy một lần mỗi dự án |
| `/speckit-specify` | mô tả tự nhiên, tập trung "cái gì" và "vì sao" | tạo spec |
| `/speckit-clarify` | (tùy chọn) vùng cần làm rõ | hỏi các điểm mơ hồ, ghi câu trả lời vào spec |
| `/speckit-plan` | **mô tả tech stack và architecture bằng văn bản tự do** | sinh artifact thiết kế |
| `/speckit-checklist` | chưa thấy tham số | checklist chất lượng requirement ("unit test cho requirement") |
| `/speckit-tasks` | chưa thấy tham số | `tasks.md` sắp theo dependency |
| `/speckit-analyze` | chưa thấy tham số | báo mâu thuẫn, lỗ hổng giữa spec, plan, tasks (chỉ đọc) |
| `/speckit-implement` | chưa thấy tham số | thực thi `tasks.md` |
| `/speckit-converge` | chưa thấy tham số | đối chiếu codebase với spec/plan/tasks; nếu thiếu thì thêm task, lặp lại đến khi "Converged" |

  Lệnh `plan` nhận mô tả tech stack, **không nhận mã use case** như "UC-004". Tài liệu cũng không cho thấy `tasks` và `implement` nhận tham số. Có thêm các lệnh của extension (sửa lỗi, đánh giá ý tưởng) mà sách này không đi sâu.
- **Đường đi ngắn:** specify → plan → tasks → implement → converge. **Đường đầy đủ:** constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge.
- **Thư mục và đánh số:** quickstart nói feature đang hoạt động được ghi ở `.specify/feature.json` (hoặc environment variable `SPECIFY_FEATURE_DIRECTORY`); lệnh không đọc git branch, và git không bắt buộc (extension git thêm branch đánh số dạng `001-ten-feature`). Một tài liệu thiết kế khác của repo mô tả cấu trúc `specs/NNN-ten/` gồm `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, và `memory/constitution.md`; tôi **chưa xác minh** cấu trúc này còn đúng y hệt ở v1.3.2. Điều chắc chắn: **mã feature do Spec Kit tự quản; "UC-001" là quy ước của team hoặc AIUP, không phải của Spec Kit.**
- **Triết lý:** spec là nguồn đầu vào, mọi bước sau (plan, tasks, code) được dẫn xuất từ spec và kiểm tra chéo. Mạnh về quy trình có cấu trúc, đa agent (nhiều chục integration). Hạn chế: spec nằm theo feature, không có sẵn khái niệm "spec sống toàn hệ thống"; tài liệu về brownfield cho biết `spec.md` mô tả thay đổi dự kiến, không suy ra hành vi hiện có.

### 2.2. OpenSpec

- **Là gì:** khung SDD nhẹ của Fission-AI, tập trung vào *thay đổi* trên một bộ spec hiện hành. Release mới nhất đã kiểm tra: **v1.16.1 (07/11/2026)**. Cài bằng script, `npm install -g @fission-ai/openspec@latest` (cần **Node.js 22.12.0 trở lên** khi cài qua package manager; bản binary độc lập không cần Node), hoặc Homebrew.
- **Khởi tạo:** `openspec init` (có `--tools <danh-sách>`) tạo thư mục `openspec/` và skill/command cho từng tool, ví dụ `.claude/skills/openspec-*/`. `openspec update` làm mới file sinh ra sau khi nâng cấp CLI.
- **Cấu trúc:** `openspec/specs/<miền>/spec.md` (source of truth hiện hành); `openspec/changes/<tên-change>/` gồm `proposal.md`, `design.md`, `tasks.md` và delta specs trong `specs/`; `openspec/changes/archive/YYYY-MM-DD-<tên>/` cho change đã xong. **`openspec/config.yaml` có tồn tại**: các trường `schema`, `context`, `rules` (và một số trường nâng cao).
- **Delta spec:** các mục `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` (và `## Purpose` cho capability mới). Mỗi requirement là `### Requirement:` với keyword RFC 2119 (SHALL, MUST...), mỗi scenario là `#### Scenario:` dạng GIVEN/WHEN/THEN.
- **Lệnh `/opsx:*`:**
  - Profile **core** (mặc định): `/opsx:propose`, `/opsx:explore`, `/opsx:apply`, `/opsx:update`, `/opsx:sync`, `/opsx:archive`.
  - Profile **extended** (chọn bằng `openspec config profile`, rồi `openspec update`): `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard`.
  - **`/opsx:sync` là bước tùy chọn: gộp delta specs của một change vào spec chính** trong `openspec/specs/` (đọc ADDED/MODIFIED/REMOVED/RENAMED); change vẫn hoạt động, chưa archive. `/opsx:archive` chuyển change vào thư mục archive và **nhắc chạy sync** nếu delta chưa được gộp. Nó không phải "đồng bộ trạng thái artifact".
  - Ở một số tool dạng lệnh khác nhau (ví dụ `/opsx-propose`, `$openspec-propose`).
- **Triết lý:** "spec là source of truth hiện hành; thay đổi là delta được review". Rất hợp brownfield và PR nhỏ. Hạn chế: ít ép quy trình test/architecture; bạn tự quyết cấu trúc entity và AC bên trong.

### 2.3. Kiro (AWS)

- **Là gì:** IDE (và CLI) có agent, với "specs" là tính năng trung tâm. Mỗi spec có ba file: `requirements.md` (hoặc `bugfix.md` cho bugfix), `design.md`, `tasks.md`. Tài liệu chính thức nêu các biến thể: **Requirements-First**, **Design-First**, **Bugfix specs**, và **Quick Spec** (sinh cả ba artifact một lượt, không có approval gate). Requirement viết theo **EARS**: "WHEN [condition] THE SYSTEM SHALL [behavior]".
- **Steering** (context bền vững, giống CLAUDE.md): `.kiro/steering/` (workspace) và `~/.kiro/steering/` (global); file nền `product.md`, `tech.md`, `structure.md`; chế độ nạp `always`, `fileMatch`, `manual`, `auto`; hỗ trợ `AGENTS.md`.
- **Hooks:** file JSON trong `.kiro/hooks/`, kích hoạt theo event như `PostFileSave`, `PreToolUse`, `PostToolUse`, `Stop`.
- Đường dẫn thư mục spec `.kiro/specs/<tên>/` xuất hiện trong các bài thứ cấp; trang tài liệu tôi đọc không nêu rõ, nên ghi **chưa xác minh từ nguồn chính thức**.
- **Triết lý:** SDD tích hợp trong IDE, có duyệt từng phase. Hạn chế: gắn với hệ sinh thái Kiro; không phải Claude Code.

### 2.4. AIUP (AI Unified Process)

- **Là gì:** phương pháp do Simon Martinelli và contributors, điều chỉnh từ Rational Unified Process, phân phối dưới dạng plugin cho Claude Code (và qua Tessl cho các agent khác). Giấy phép Apache-2.0. Phiên bản `aiup-core` mới nhất tôi thấy: **3.13.0** (trên registry Tessl; chưa đối chiếu với tag chính thức).
- **Cài trong Claude Code:**

```text
/plugin marketplace add ai-unified-process/marketplace
/plugin install aiup-core
```

- **Kiến trúc plugin:** `aiup-core` (độc lập công nghệ) cộng các plugin theo layer: `aiup-flyway`, `aiup-jooq`, `aiup-jpa`, `aiup-spring-boot`, `aiup-vaadin`, `aiup-angular`, `aiup-playwright`. Plugin gộp stack `aiup-vaadin-jooq` và `aiup-angular-jpa` **đã deprecated** (sẽ gỡ cùng `aiup-core` 4.0.0), thay bằng plugin theo layer; còn `aiup-blazor-dotnet` và `aiup-nestjs-nextjs`.
- **Skills của `aiup-core` theo phase:** Inception `/requirements`; Elaboration `/entity-model`, `/use-case-diagram`, `/business-process`; Construction `/use-case-spec`, `/test-case`, `/stack`, `/use-case-implement`, `/use-case-test`, `/use-case-coverage`, `/test-case-implement`, `/test-case-coverage`; Transition `/user-guide`, `/acceptance-protocol`, `/release-notes`; mọi pha `/spec-review`, `/next`, `/open-questions`, `/architecture-decision`, `/reverse-engineer`.
- **Cách gọi trong Claude Code:** README hiển thị dạng thường (`/requirements`, `/use-case-spec UC-001`), **không** nhắc dạng có namespace `/aiup-core:requirements`. Theo tài liệu Claude Code, skill của plugin thường có namespace `/tên-plugin:tên-skill`, nên nếu `/requirements` không chạy trên máy bạn hãy thử dạng có namespace hoặc gõ `/` để xem danh sách; tôi **chưa xác minh** cách hiện tại. Agent không có slash command thì yêu cầu bằng ngôn ngữ tự nhiên ("Specify UC-001").
- **`reverse-engineer`:** không có cờ `--target` hay `--source` trong tài liệu. Skill kích hoạt bằng ngôn ngữ tự nhiên hoặc `/reverse-engineer`; nó đọc entry point, domain model, schema, authentication, integration rồi đề xuất entity model, use case diagram và các use case, đồng thời báo phần hành vi chưa phân loại được.
- **Thư mục đầu ra:** `docs/` (`vision.md`, `requirements.md`, `glossary.md`, `entity_model.md`, `use_cases.puml`, `use_cases/UC-001-*.md`, `test_cases/TC-001-*.md`, `architecture/stack.md`...). Đây là cấu trúc của AIUP, **không phải** cấu trúc `specs/` của lab; bạn có thể cấu hình hoặc map, nhưng tôi chưa xác minh cách đổi đường dẫn.
- **Triết lý:** pipeline cố định BR → entity → use case → test case → code, mọi bước đọc artifact trước đó. Hạn chế: thiên về stack Java/Spring/Vaadin ở các plugin layer (đã có thêm .NET và NestJS).

### 2.5. Tự làm: Markdown + CLAUDE.md (+ skills)

Chính là chương 5 cộng lab này: thư mục `specs/`, template, CLAUDE.md, một hai skill, hook kiểm tra. Ưu điểm: không phụ thuộc, vừa khít team, ít lớp phải học. Nhược: bạn tự duy trì, tự giữ kỷ luật, không có cộng đồng cập nhật.

## 3. So sánh nhanh

| | Spec Kit | OpenSpec | Kiro | AIUP | Tự làm |
|---|---|---|---|---|---|
| Hình thức | CLI + skills vào agent | CLI + skills vào agent | IDE/CLI riêng | Plugin Claude Code (+Tessl) | Markdown + CLAUDE.md |
| Đơn vị công việc | feature | change (delta) | spec (ba file) | use case | bạn định nghĩa |
| Spec sống lâu | theo feature | có (`openspec/specs/`) | theo spec | có (`docs/`) | bạn định nghĩa |
| Điểm mạnh | quy trình đầy đủ, checklist, analyze, converge | nhẹ, delta, brownfield | duyệt từng phase, EARS, hook/steering | BR-UC-entity-test, tách layer công nghệ | linh hoạt, rẻ |
| Giới hạn | feature-centric; tài liệu thay đổi nhanh | ít ép test/architecture | ecosystem lock-in | thiên Java/JVM ở các plugin layer | không có workflow sẵn |
| Cần | Python 3.11+, uv | Node 22.12+ (hoặc binary) | cài Kiro | Claude Code plugin | không |

## 4. Chọn cái nào

- **Greenfield, team chưa có quy trình, muốn khung đầy đủ:** Spec Kit hoặc AIUP.
- **Brownfield, thay đổi nhỏ liên tục, muốn spec hiện hành tích lũy:** OpenSpec.
- **Dùng AWS/Kiro sẵn, muốn duyệt từng phase trong IDE:** Kiro.
- **Stack Java/Spring, muốn từ BR đến test có sẵn:** AIUP.
- **Team nhỏ, quy ước riêng, tránh dependency:** tự làm (lab của sách).
- Có thể kết hợp: ví dụ tự làm phần BR/UC/Entity, dùng OpenSpec cho vòng change. Hãy thử một tool trên một use case thật trước khi cam kết.

## 5. Cạm bẫy

- Chép lệnh từ bài viết cũ. Spec Kit cũ dùng `/specify`, `/plan`, `/tasks`, `/implement`; bản hiện tại có tiền tố `speckit` và là skill.
- Truyền "UC-004" cho `plan`. Nó cần mô tả tech stack.
- Hiểu `/opsx:sync` là đồng bộ trạng thái; nó gộp delta vào spec chính.
- Dùng plugin gộp stack AIUP đã deprecated.
- Để tool áp đặt cấu trúc thư mục rồi lệch với quy ước team; chọn một cấu trúc và ghi vào CLAUDE.md.
- Nhầm ví dụ minh họa (annotation `@UseCase`, v.v.) là tính năng của tool. Tài liệu bốn tool trên không nêu tính năng này; nếu muốn, bạn tự thêm quy ước.

## 6. Tóm tắt

1. Spec Kit: feature, skill `/speckit-...`, `plan` nhận tech stack; Python 3.11+.
2. OpenSpec: change và delta; core/extended; `/opsx:sync` gộp delta; có `openspec/config.yaml`; Node 22.12+.
3. Kiro: ba file (requirements, design, tasks), EARS, steering, hooks.
4. AIUP: plugin Claude Code; plugin gộp stack đã deprecated; `reverse-engineer` bằng ngôn ngữ tự nhiên.
5. Tự làm là lựa chọn hợp lệ; chọn theo context và thử trên một use case thật.

## 7. Tự kiểm tra

1. Lệnh nào của Spec Kit nhận mô tả tech stack?
2. `/opsx:sync` khác `/opsx:archive` thế nào?
3. Vì sao không nên dùng `aiup-vaadin-jooq` cho dự án mới?
4. Brownfield với thay đổi nhỏ liên tục, bạn thử tool nào trước?

<details><summary>Đáp án</summary>

1. `/speckit-plan` (và `constitution` nhận nguyên tắc; `specify` nhận mô tả tính năng).
2. Sync gộp delta vào spec chính và giữ change mở; archive chuyển change vào thư mục archive và có thể nhắc sync.
3. Đã deprecated, sẽ gỡ cùng `aiup-core` 4.0.0; dùng plugin theo layer.
4. OpenSpec, vì delta model khớp thay đổi nhỏ trên hệ thống có sẵn.
</details>
