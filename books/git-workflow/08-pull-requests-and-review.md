# Chương 8. Pull request và code review

## Vấn đề

PR 2.000 dòng thay đổi nằm chờ review 4 ngày, rồi bị approve bằng "LGTM" vì không ai đọc nổi. PR là điểm kiểm soát chất lượng của workflow; thiết kế nó sai thì cả trunk-based lẫn GitHub Flow đều hỏng.

## PR nhỏ

- Mục tiêu: dưới ~400 dòng diff có ý nghĩa, một ý định duy nhất. Con số này là heuristic, không phải chuẩn.
- Tách refactor khỏi thay đổi hành vi: PR refactor chỉ review "hành vi không đổi", PR feature chỉ review logic mới.
- Dùng feature flag để merge phần dở dang (Chương 5).
- Mô tả PR: vì sao, cái gì thay đổi, cách kiểm tra, rủi ro, link issue/spec. Template ở `.github/pull_request_template.md`.

## Stacked PR

Khi một feature lớn phải chia thành nhiều PR phụ thuộc nhau (PR2 dựa trên PR1), bạn có một "stack". Trước đây phải tự rebase thủ công hoặc dùng tool ngoài (Graphite, git-town, Sapling, Jujutsu...).

Hiện nay GitHub có tính năng **Stacked pull requests** cùng GitHub CLI extension `gh stack` (repo `github/gh-stack`): tạo và sắp xếp các branch, giữ chúng được rebase, push và mở các PR liên kết với đúng base branch. Trạng thái tra được ngày 11/2026 còn mâu thuẫn giữa các nguồn (docs GitHub ghi là public preview, một bài báo nói đã GA, trang gh-stack nói private preview): **chưa xác minh trạng thái GA**, kiểm tra docs `docs.github.com` mục stacked pull requests trước khi dựa vào. Ràng buộc nêu trong tài liệu: mọi branch trong cùng một repo (không hỗ trợ cross-fork), chưa hỗ trợ GitHub Desktop.

Không có tool cũng làm được: tạo `feat/1`, `feat/2` từ `feat/1`, PR2 có base là `feat/1`. Sau khi PR1 được squash merge, rebase PR2 lên `main` bằng `git rebase --onto main <old-base-of-PR2> feat/2` rồi đổi base. Đây là chỗ đáng dùng tool.

## Review checklist

Người review nên kiểm:
1. **Đúng yêu cầu**: khớp acceptance criteria/spec không?
2. **Đúng đắn**: edge case, lỗi, concurrency, null/empty.
3. **Test**: có test cho hành vi mới, test có thật sự fail khi code sai?
4. **Bảo mật**: input validation, secret, authz, SQL/command injection.
5. **Tương thích**: API/schema có breaking change không (và message có `!` không)?
6. **Vận hành**: log, metric, migration an toàn, rollback được không?
7. **Dễ đọc**: tên, độ phức tạp, comment giải thích "vì sao".

Người tạo PR: tự review diff trước, chạy test local, giữ PR ở trạng thái draft tới khi sẵn sàng. Giữ thái độ review vào code, không vào người; phân biệt "blocking" và "nit". Đặt SLA phản hồi (ví dụ trong 4 giờ làm việc).

## CODEOWNERS

File `CODEOWNERS` (đặt ở `.github/`, repo root hoặc `docs/`) khai báo người/team phụ trách theo path; dòng khớp **sau cùng** thắng.

```
# .github/CODEOWNERS
*                   @acme/backend
/services/orders/   @acme/orders-team
/services/billing/  @acme/billing-team @alice
*.sql               @acme/dba
/.github/           @acme/platform
```

Khi ruleset/branch protection bật "Require review from Code Owners", PR đụng vào path nào thì cần approve của owner path đó. Owner cần có quyền write. GitLab cũng có CODEOWNERS với cú pháp tương tự (có thêm section).

## Ruleset so với branch protection

GitHub có hai cơ chế bảo vệ nhánh: **branch protection rules** (cũ, mỗi nhánh/pattern một rule) và **rulesets** (mới hơn). Theo docs GitHub, ưu điểm của ruleset: nhiều ruleset áp dụng cùng lúc cho cùng nhánh và khi chồng nhau thì rule khắt khe hơn thắng (branch protection chỉ có một rule hiệu lực); bật/tắt bằng trạng thái enforcement (Active/Disabled) mà không xóa; có bypass list theo role, team hoặc GitHub App; áp dụng được cho tag và nhiều repo ở cấp organization. Docs có hướng dẫn chuyển branch protection sang ruleset. Khuyến nghị cho repo mới: dùng rulesets.

Cấu hình tối thiểu cho `main`:
- Require a pull request before merging (1 approval, dismiss stale approvals khi có push mới, require Code Owners nếu dùng).
- Require status checks to pass (chọn đúng job CI; cân nhắc "require branches to be up to date").
- Block force pushes và deletion.
- Require linear history (nếu dùng squash/rebase).
- Cho phép squash merge, tắt các method còn lại ở Settings.
- Require signed commits (nếu team ký, Chương 12).
- Require merge queue (nếu nhiều người merge).

Required status checks: chọn tên check mà workflow thực sự báo cáo. Cạm bẫy: job có `if:`/path filter bị skip thì check ở trạng thái "skipped" hoặc không bao giờ xuất hiện; một số cấu hình làm PR kẹt vì check bắt buộc không chạy. Cách phổ biến: một job tổng hợp `ci-ok` luôn chạy (`if: always()`), phụ thuộc các job thật, và chỉ yêu cầu job này.

## Merge queue

Merge queue của GitHub xếp các PR đã approve vào hàng, tạo branch tạm có prefix `gh-readonly-queue/<base>` chứa base cộng các PR đứng trước, chạy CI, và merge nếu pass. Nó tránh tình trạng hai PR đều xanh riêng nhưng hỏng khi gộp, và bỏ yêu cầu "update branch" thủ công. Quy tắc:
- Workflow chạy check bắt buộc phải có event `merge_group`:

```yaml
on:
  pull_request:
  merge_group:
```

- CI bên thứ ba phải chạy trên push vào branch có prefix `gh-readonly-queue/<base>`.
- Không bật được trên rule có pattern tên nhánh dùng wildcard `*`.
- Merge method của queue (merge, squash hoặc rebase) cấu hình trong cài đặt queue.

GitLab tương đương là merge train (Chương 4).

## Squash, rebase hay merge ở GitHub

Settings > General > Pull Requests cho bật/tắt từng method. Với tiêu đề squash, có thể chọn lấy tiêu đề PR làm message mặc định; kết hợp Conventional Commits (Chương 7) để changelog tự sinh.

## Cạm bẫy

- Required check có tên khác với tên job thực tế sau khi đổi workflow: PR chờ mãi.
- Quên `merge_group` trong workflow khi bật queue.
- CODEOWNERS trỏ tới team không có quyền write: rule không có tác dụng.
- Cho admin bypass ruleset mặc định rồi quên; sự cố vẫn đẩy thẳng lên `main`.
- Review chỉ nhìn diff mà không chạy hoặc không hiểu ngữ cảnh.

## Tóm tắt

- PR nhỏ, một ý định; stacked PR cho feature lớn (tool `gh stack`, trạng thái GA chưa xác minh).
- CODEOWNERS ánh xạ path sang owner; dòng khớp sau cùng thắng.
- Rulesets linh hoạt hơn branch protection (chồng lớp, bypass list, bật/tắt, cấp organization).
- Merge queue test kết quả gộp; workflow cần `merge_group`.

## Câu hỏi tự kiểm tra

1. Vì sao PR nhỏ giúp workflow trunk-based chạy được?
2. Khác biệt chính giữa ruleset và branch protection rule?
3. Cần thêm gì vào workflow GitHub Actions khi bật merge queue?
4. Trong CODEOWNERS, nếu hai dòng cùng khớp một file thì dòng nào có hiệu lực?

<details><summary>Đáp án</summary>

1. Review nhanh nên nhánh sống ngắn, ít conflict, dễ revert.
2. Ruleset có thể chồng nhiều lớp (rule khắt khe thắng), bật/tắt bằng enforcement status, có bypass list, áp dụng cho tag và cấp organization; branch protection chỉ một rule hiệu lực cho nhánh.
3. Event `merge_group` bên cạnh `pull_request`.
4. Dòng khớp sau cùng trong file.

</details>
