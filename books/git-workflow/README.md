# Git workflow và branching strategy cho team

Bản học cho developer TypeScript/Node.js và Go đã dùng git hằng ngày (commit, push, pull) nhưng chưa nắm chắc cách làm việc nhóm: chiến lược nhánh, pull request, release, và gỡ rối. Ví dụ xuyên suốt là một hệ thống đặt hàng nhỏ (`orders`), với service Go và package TypeScript.

## Ai nên đọc
- Developer backend hoặc fullstack mới vào team, hoặc vừa được giao dựng quy trình cho team.
- Tech lead cần chọn workflow (Git Flow, GitHub Flow, trunk-based) và cấu hình repo có lý do.

## Kiến thức cần có
- Dùng được `git add/commit/push/pull/branch/merge` ở mức cơ bản.
- Biết Docker ở mức chạy `docker run` (để chạy lab).
- Biết đọc TypeScript và Go cơ bản.

## Mục lục
1. [Mô hình dữ liệu của git ở mức đủ dùng](01-git-data-model.md)
2. [Merge, rebase, squash](02-merge-rebase-squash.md)
3. [Git Flow](03-git-flow.md)
4. [GitHub Flow và GitLab Flow](04-github-flow-gitlab-flow.md)
5. [Trunk-based development](05-trunk-based-development.md)
6. [So sánh và cách chọn workflow](06-choosing-a-workflow.md)
7. [Commit tốt](07-good-commits.md)
8. [Pull request và code review](08-pull-requests-and-review.md)
9. [Versioning và release](09-versioning-and-release.md)
10. [Monorepo](10-monorepo.md)
11. [Gỡ rối và cứu dữ liệu](11-troubleshooting-and-recovery.md)
12. [Bảo vệ repo](12-protecting-the-repo.md)
13. [Checklist cho team](13-team-checklist.md)

Lab: [lab/README.md](lab/README.md).

## Phiên bản đã dùng hoặc đã kiểm tra (tra 09/11/2026)

| Thành phần | Phiên bản | Nguồn |
|---|---|---|
| Git (upstream) | 2.56.0 (28/09/2026); **Git 3.0 chưa phát hành** | git-scm.com, `git-scm.com/docs/BreakingChanges` |
| Git trong lab (`node:lts`, Debian) | 2.47.3 | chạy thật |
| Git 3.0 dự kiến | `main` mặc định, SHA-256 mặc định, reftable mặc định, Rust bắt buộc, `safe.bareRepository=explicit`, bỏ `whatchanged`, `pack-redundant`, grafts | BreakingChanges (đã đọc) |
| Git Flow (Driessen) | bài 2010, ghi chú 03/2020 khuyên workflow đơn giản hơn cho continuous delivery | nvie.com |
| git-flow-avh | archived, release cuối 1.12.3 (05/2019) | GitHub API |
| git-flow-next (gittower) | v2.1.0 (08/09/2026) | GitHub API |
| Conventional Commits | 1.0.0 | conventionalcommits.org |
| semantic-release | v25.0.9 (08/2026) | GitHub releases |
| release-please | v17.11.2 (08/2026) | GitHub releases |
| changesets | `@changesets/cli` 3.0.3 (09/2026) | GitHub releases |
| GoReleaser | v2.20.0 (04/11/2026) | GitHub releases |
| husky | 9.1.7 | npm registry |
| lefthook | v2.2.2 (10/2026) | GitHub releases, chạy thật |
| commitlint | `@commitlint/cli` 21.2.4 (chạy thật) | npm |
| gitsign | v0.18.0 (10/2026) | GitHub releases |
| git-filter-repo | v2.47.0 (12/2024) | GitHub releases |
| Docker | 29.8.1 | host |

Chưa xác minh: trạng thái GA của GitHub stacked pull requests (nguồn mâu thuẫn), hỗ trợ SHA-256 trên GitHub, phiên bản các GitHub Action dùng trong ví dụ monorepo, chi tiết trusted publishing của npm, quy trình xóa cached view của GitHub, phiên bản gitleaks.

## Cách chạy lab
Toàn bộ lệnh git chạy trong Docker (`node:lts`), xem [lab/README.md](lab/README.md). Ví dụ:

```sh
cd lab
MSYS_NO_PATHCONV=1 timeout 600 docker run --rm --name bookcheck-git-a \
  -v "$(pwd):/work:ro" node:lts sh /work/scripts/a-git-flow.sh
```

## Đọc thêm
- Scott Chacon, Ben Straub, *Pro Git* (miễn phí tại https://git-scm.com/book): nền tảng, đặc biệt các chương về branching và Git internals.
- Vincent Driessen, "A successful Git branching model" (https://nvie.com/posts/a-successful-git-branching-model/), kèm ghi chú 2020.
- Paul Hammant, https://trunkbaseddevelopment.com: trunk-based development, branch by abstraction, release from trunk.
- Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* (IT Revolution, 2018): nghiên cứu đằng sau DORA metrics.
- https://www.conventionalcommits.org và https://semver.org: hai spec ngắn, nên đọc nguyên văn.
- Docs GitHub về rulesets và merge queue (docs.github.com, mục Repositories > Configuring branches and merges).
