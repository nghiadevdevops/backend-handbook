# Phụ lục D. Glossary

| Thuật ngữ | Giải thích |
|---|---|
| **AC (Acceptance Criteria)** | Tiêu chí chấp nhận: ví dụ cụ thể (Given/When/Then) chứng minh một hành vi đã xong. |
| **Adapter** | Implementation của một port, nối ứng dụng với công nghệ cụ thể (database, SMTP, Outlook). |
| **Aggregate / Aggregate root** | Cụm đối tượng bảo vệ một bất biến; root là cửa duy nhất để sửa cụm. Không phải entity nào cũng là root. |
| **ADR** | Architecture Decision Record: ghi lại một quyết định kiến trúc và lý do. |
| **AGENTS.md** | File chỉ dẫn cho coding agent theo chuẩn chung nhiều tool; Claude Code đọc nó khi không có CLAUDE.md. |
| **AIUP** | AI Unified Process: phương pháp và plugin cho Claude Code của Simon Martinelli và contributors, điều chỉnh từ RUP. |
| **BR (Business Requirement)** | Yêu cầu kinh doanh: vì sao làm, đo gì, trong/ngoài phạm vi. |
| **Brownfield / Greenfield** | Hệ thống có sẵn (cần giữ hành vi) / hệ thống mới hoàn toàn. |
| **Characterization test** | Test mô tả hành vi hiện tại của hệ thống cũ, để khóa nó trước khi đổi. |
| **CLAUDE.md** | File Markdown chỉ dẫn bền vững cho Claude Code theo dự án, người dùng hoặc cá nhân. |
| **Constitution (Spec Kit)** | Bộ nguyên tắc dự án mà các bước sau của Spec Kit đối chiếu; lệnh `/speckit-constitution`. |
| **Delta spec (OpenSpec)** | Spec mô tả thay đổi (ADDED/MODIFIED/REMOVED) so với spec hiện hành. |
| **EARS** | Easy Approach to Requirements Syntax: mẫu "WHEN ... THE SYSTEM SHALL ..."; Kiro dùng cho `requirements.md`. |
| **Entity** | Đối tượng miền có định danh. |
| **Hexagonal Architecture** | Còn gọi Ports and Adapters (Cockburn): logic ở giữa, hạ tầng qua port/adapter. |
| **Hook (Claude Code)** | Lệnh chạy tại sự kiện vòng đời; mã thoát 2 chặn trên sự kiện chặn được. |
| **MCP** | Model Context Protocol: giao thức nối agent với công cụ/dữ liệu ngoài. |
| **Plan mode** | Chế độ Claude Code chỉ đọc và đề xuất kế hoạch, không sửa file tới khi duyệt. |
| **Plugin (Claude Code)** | Gói skills, agents, hooks, MCP servers; cài từ marketplace. |
| **Port** | Interface do ứng dụng định nghĩa cho khả năng nó cần (ví dụ `BookingRepository`). |
| **SDD** | Spec-Driven Development: spec được review, lưu trong repo và là đầu vào chính; test chứng minh code khớp. |
| **Skill (Claude Code)** | Thư mục có `SKILL.md`; gọi bằng `/tên` hoặc được nạp tự động theo mô tả. |
| **Steering (Kiro)** | Ngữ cảnh bền vững trong `.kiro/steering/`. |
| **Subagent** | Agent chuyên biệt (file trong `.claude/agents/`) chạy trong ngữ cảnh riêng. |
| **Traceability** | Khả năng truy vết hai chiều BR, UC, AC, test, code. |
| **UC (Use Case)** | Mục tiêu mà một actor đạt được với hệ thống, kèm luồng chính, luồng phụ, lỗi. |
| **Ubiquitous language** | Ngôn ngữ chung của miền, dùng thống nhất ở spec, code, test. |
| **Value object** | Đối tượng không định danh, bất biến, so sánh theo giá trị (ví dụ `TimeSlot`). |
| **Vibe coding** | Thuật ngữ của Andrej Karpathy (02/2025): buông theo cảm giác, nhận mọi đề xuất của mô hình, dán lỗi để lặp, quên code tồn tại. |
