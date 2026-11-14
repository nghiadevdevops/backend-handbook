# Appendix B. PR template and git conventions

## B.1. PR template

Đặt ở `.github/pull_request_template.md` (GitHub tự điền vào PR mới).

````markdown
## UC liên quan
<!-- Bắt buộc. Ví dụ: UC-001 (link tới specs/use-cases/...) -->

## Loại thay đổi
- [ ] Spec (BR/UC/Entity/AC)
- [ ] Code theo spec đã duyệt
- [ ] Sửa lỗi (đã thêm AC hoặc regression test)
- [ ] Infrastructure/khác

## AC đã implement
<!-- Liệt kê AC-xxx-n và tên test tương ứng -->

## Traceability
- [ ] `specs/traceability.md` đã cập nhật
- [ ] Mục "Lịch sử" của UC đã cập nhật (nếu đổi hành vi)

## Test
<!-- Lệnh đã chạy và kết quả (chạy trong Docker/CI) -->

## Dùng AI
- [ ] Có dùng AI để sinh code/spec
- Business decision nào do người quyết (và ở đâu trong spec)?
- Có constant hoặc error branch nào AI tự thêm mà spec không nêu? (nếu có: đã ghi vào spec hoặc xóa)
- [ ] Test không bị sửa cho khớp code (hoặc đã giải thích)
````

## B.2. Commit and branch conventions

Quy ước đề xuất (của team, không phải tính năng của git):

```text
<type>(<UC hoặc BR>): <mô tả ngắn>

feat(UC-001): reject overlapping booking
fix(UC-002): mark late_cancel when under 120 minutes
docs(UC-003): add schedule view spec
test(UC-001): add AC-001-7 back-to-back case
```

`type`: `feat`, `fix`, `docs` (spec), `test`, `refactor`, `chore`. Branch: `uc-001-create-booking`, `spec/uc-003-view-schedule`.

Traceability bằng git, đã chạy thử trong container (git 2.47.3):

```bash
# mọi commit liên quan UC-001
git log --oneline --grep="UC-001"

# file bị sửa nhiều nhất trong 1 năm. BẮT BUỘC có --format=
git log --since="1 year ago" --format= --name-only | sort | uniq -c | sort -rn | head -20
```

Kết quả thử: ba commit `feat(UC-001)`, `fix(UC-001)`, `fix(UC-002)` trên repo thử; `--grep="UC-001"` trả đúng hai commit đầu. Bản thiếu `--format=` đếm lẫn các dòng `commit`, `Author:`, `Date:` và dòng trống.

## B.3. CI suggestions

Chạy hai việc trong container ở mỗi PR: bộ test acceptance, và `scripts/check-ac-coverage.sh` (xem lab). Thất bại nếu có AC thiếu test.

## B.4. CODEOWNERS (optional)

Để yêu cầu PO duyệt mọi thay đổi dưới `specs/`, dùng file `CODEOWNERS` của GitHub:

```text
/specs/business-requirements/ @org/product-owners
/specs/use-cases/             @org/product-owners @org/tech-leads
/specs/entities.md            @org/tech-leads
```

Tên nhóm là ví dụ; thay bằng nhóm thật của bạn. Cần bật "Require review from Code Owners" trong branch protection.
