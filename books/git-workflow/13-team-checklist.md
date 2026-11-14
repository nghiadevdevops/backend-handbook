# Chương 13. Checklist cho team

## Vấn đề

Kiến thức rời rạc không thành quy trình. Chương này gom thành một bộ quy ước ngắn mà team có thể copy vào `CONTRIBUTING.md` và cấu hình ngay.

## 1. Chọn workflow

- [ ] Trả lời hai câu hỏi (Chương 6): có kiểm soát thời điểm deploy không? Bao nhiêu version song song?
- [ ] Web/API deploy liên tục: trunk-based, squash merge, feature flag.
- [ ] Thư viện/CLI/mobile: trunk cộng `release/x.y` khi cần, SemVer, cherry-pick upstream first.
- [ ] Nhiều version hoặc on-premise và QA tách biệt: Git Flow rút gọn hoặc GitLab Flow release branches.
- [ ] Ghi quyết định vào repo (`CONTRIBUTING.md`), kèm lý do.

## 2. Quy ước tên branch

```
<type>/<issue-id>-<mô-tả-ngắn>
feature/ORD-142-cancel-shipped
fix/ORD-157-rounding
chore/bump-go-1-27
release/1.4        # chỉ khi cần
hotfix/1.4.1       # chỉ khi cần
```

- Chữ thường, dấu gạch ngang, không dấu cách, không quá dài.
- Branch sống tối đa 2 ngày (trunk) hoặc xóa ngay sau merge (bật "Automatically delete head branches").

## 3. Quy ước commit

- [ ] Conventional Commits 1.0.0: `type(scope)!: description`.
- [ ] Type dùng: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- [ ] Tiêu đề ≤ 72 ký tự, thể mệnh lệnh; body giải thích vì sao.
- [ ] Footer: `Refs: ORD-142`, `Spec: docs/specs/...`, `BREAKING CHANGE: ...`.
- [ ] Kiểm tra bằng commitlint ở `commit-msg` hook (cục bộ) và CI (kiểm tra tiêu đề PR).

## 4. Cấu hình repo mẫu (GitHub)

**Settings > General > Pull Requests**
- [ ] Chỉ bật Squash merging; default message là PR title và description.
- [ ] Automatically delete head branches.
- [ ] Always suggest updating pull request branches.

**Ruleset cho `main`** (Active, bypass list tối thiểu)
- [ ] Require a pull request: 1 approval, dismiss stale approvals, require Code Owners.
- [ ] Require status checks: `ci-ok` (job tổng hợp); workflow có `merge_group`.
- [ ] Require merge queue (khi có nhiều người merge cùng lúc).
- [ ] Require linear history.
- [ ] Block force pushes, block deletions.
- [ ] Require signed commits (chỉ khi cả team đã cấu hình ký).

**Ruleset cho tag `v*`**
- [ ] Cấm xóa và cấm cập nhật tag đã tạo.

**Khác**
- [ ] `.github/CODEOWNERS`, `.github/pull_request_template.md`.
- [ ] Bật secret scanning và push protection.
- [ ] `.gitignore`, `.gitattributes` (`* text=auto eol=lf`).

## 5. Quy tắc làm việc hằng ngày

1. Cập nhật `main` trước khi tạo branch: `git switch main && git pull --ff-only`.
2. Tạo branch ngắn, commit atomic, push sớm, mở draft PR.
3. Rebase trên `main` khi cần (chỉ nhánh của riêng mình), push bằng `--force-with-lease`.
4. PR dưới ~400 dòng; tự review diff trước khi xin review.
5. Review trong 4 giờ làm việc; phân biệt blocking và nit.
6. Merge xong xóa branch; CI deploy từ `main`.
7. Hỏng trunk: revert trước, tìm nguyên nhân sau.
8. Không bao giờ rebase hoặc force push `main`.

## 6. Quy trình release (mẫu)

- Web/API: mỗi merge vào `main` deploy tự động; tag annotated `vYYYY.MM.DD.N` hoặc theo SemVer nếu cần.
- npm: changesets (monorepo) hoặc release-please/semantic-release, `npm publish --provenance` hoặc trusted publishing.
- Go: tag `vX.Y.Z`, `/vN` cho major ≥ 2, GoReleaser chạy khi push tag `v*`.
- Hotfix: fix ở `main`, `cherry-pick -x` sang `release/x.y`, tag `vX.Y.(Z+1)`.

## 7. Cấu hình git local khuyến nghị

```sh
git config --global init.defaultBranch main
git config --global pull.ff only
git config --global push.autoSetupRemote true
git config --global rebase.autoSquash true
git config --global rebase.autoStash true
git config --global rerere.enabled true
git config --global fetch.prune true
git config --global commit.verbose true
git config --global merge.conflictStyle zdiff3
```

`zdiff3` có từ Git 2.35, hiển thị thêm phần base trong conflict marker, giúp giải conflict dễ hơn.

## 8. Đo lường

- [ ] Tuổi trung vị của PR, kích thước PR, thời gian chờ review.
- [ ] Bốn chỉ số DORA, xem theo xu hướng, không dùng đánh giá cá nhân.
- [ ] Rà soát quy ước mỗi quý: bỏ cái không ai theo, tự động hóa cái hay bị quên.

## Tóm tắt

- Chọn workflow theo cách phát hành, rồi ghi thành văn bản.
- Branch ngắn, commit theo Conventional Commits, PR nhỏ.
- Ruleset, required check `ci-ok`, merge queue, CODEOWNERS làm quy ước có hiệu lực thật.
- Hook giúp phản hồi sớm; CI và server-side rule mới bắt buộc.
- Đo tuổi PR và DORA để biết quy trình có tốt lên không.

## Câu hỏi tự kiểm tra

1. Cấu hình merge method nào phù hợp cho web service deploy liên tục?
2. Vì sao nên yêu cầu job tổng hợp `ci-ok` thay vì từng job?
3. Hotfix cho bản đã phát hành đi theo thứ tự nào?
4. Chỉ số nào dễ đo nhất để biết nhánh có đang sống quá lâu?

<details><summary>Đáp án</summary>

1. Chỉ squash merge, tiêu đề PR theo Conventional Commits.
2. Job bị skip do path filter không làm PR kẹt; chỉ một check ổn định tên được yêu cầu.
3. Fix ở `main`, cherry-pick `-x` sang release branch, tag bản vá.
4. Tuổi của PR (thời gian từ lúc mở tới lúc merge).

</details>
