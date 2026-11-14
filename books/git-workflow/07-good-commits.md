# Chapter 7. Good Commits

## The problem

Sáu tháng sau, bạn chạy `git blame` vào một dòng lạ và thấy message "fix". Lịch sử là tài liệu, và nó chỉ hữu ích nếu mỗi commit nói được **vì sao** thay đổi tồn tại.

## Atomic commit

Một commit = một thay đổi logic, tự đứng được: build và test pass tại commit đó. Lợi ích:
- `git bisect` chính xác (lab f).
- `git revert` một thay đổi mà không kéo theo thay đổi khác.
- Review từng bước dễ hơn.

Không atomic: "add endpoint, refactor utils, update deps" trong một commit. Tách bằng `git add -p` (chọn từng hunk) hoặc `git add -i`.

```sh
git add -p src/orders.ts   # y/n/s(split)/e(edit) từng hunk
git commit -m "refactor(orders): extract totalOf helper"
```

## Commit messages

Cấu trúc: dòng tiêu đề, dòng trống, body, footer.

- Tiêu đề: ≤ ~50-72 ký tự, thể mệnh lệnh ("add", không phải "added"), không dấu chấm cuối.
- Body: giải thích **vì sao** và tác động, không lặp lại diff. Wrap ~72 cột.
- Footer: liên kết issue, breaking change, đồng tác giả.

```
fix(orders): reject cancel after shipment

Cancel on a shipped order marked it cancelled but the courier job kept
running. Return 409 and keep the status, so support can refund manually.

Refs: ORD-142
```

## Conventional Commits

Spec **Conventional Commits 1.0.0** (conventionalcommits.org). Dạng:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

- `fix:` ứng với PATCH, `feat:` ứng với MINOR trong SemVer.
- Breaking change ứng với MAJOR: footer `BREAKING CHANGE: ...` hoặc dấu `!` trước dấu hai chấm (`feat(api)!: drop v1 routes`).
- Các type khác (`docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`) được spec cho phép nhưng không bắt buộc cụ thể; bộ type dưới đây là quy ước phổ biến (từ Angular), không phải spec.

Lợi ích: sinh changelog và tính version tự động (Chương 9), lọc lịch sử (`git log --grep '^feat'`), message đồng nhất. Chi phí: cần kỷ luật, nên kiểm tra bằng commitlint (Chương 12). Với team squash merge, chỉ cần **tiêu đề PR** theo Conventional Commits, và cấu hình repo dùng tiêu đề PR làm message squash.

## Linking issues and specs

- Trong footer: `Refs: ORD-142`, `Closes #57` (GitHub tự đóng issue khi merge vào default branch).
- Với phát triển theo spec (cuốn "Spec-Driven Development" trong bộ sách): ghi đường dẫn spec hoặc id requirement ở footer, ví dụ `Spec: docs/specs/order-cancel.md#AC-3`, để từ code truy được về acceptance criteria và ngược lại.
- Tên branch chứa id issue (`feature/ORD-142-cancel-shipped`) giúp công cụ tự liên kết.

## fixup and autosquash

Phát hiện lỗi nhỏ trong commit cũ của chính PR của bạn? Đừng tạo commit "fix typo" vô nghĩa.

```sh
git commit --fixup <hash-của-commit-cần-sửa>
git rebase -i --autosquash main
```

`--fixup` tạo commit có tiêu đề `fixup! <tiêu đề gốc>`. `rebase -i --autosquash` tự sắp commit đó ngay sau commit gốc và đánh dấu `fixup`. Đặt `git config --global rebase.autoSquash true` để luôn bật. Trong script/CI có thể chạy không tương tác bằng `GIT_SEQUENCE_EDITOR=:` (giữ nguyên todo list đã được autosquash sắp xếp). Lab (h) `lab/scripts/h-autosquash.sh` chạy chính xác chuỗi này. Output thật:

```
8053e0a fixup! feat(a): add a
93b1197 feat(b): add b
612f26d feat(a): add a
1539688 feat: base
--- rebase -i --autosquash (non-interactive)
9a20bb0 feat(b): add b
16e3119 feat(a): add a
1539688 feat: base
--- content of a.txt:
a-fixed
```

Commit `fixup!` đã được gộp vào `feat(a): add a` (hash mới `16e3119`) và nội dung đã sửa. Chỉ làm trên nhánh chưa chia sẻ (Chương 2).

Các biến thể: `--fixup=amend:<hash>` (sửa cả message), `--fixup=reword:<hash>` (chỉ sửa message), có từ Git 2.32.

## Useful configuration

```sh
git config --global commit.template ~/.gitmessage
git config --global commit.verbose true     # hiện diff trong editor khi viết message
```

## Pitfalls

- Message "wip", "fix", "update": vô giá trị khi blame.
- Commit lẫn file sinh tự động (lockfile là ngoại lệ hợp lý nếu đi kèm đổi dependency).
- Commit không build được giữa chừng (phá bisect).
- Viết body mô tả "làm gì" mà không nói "vì sao".
- Dùng `!` hoặc `BREAKING CHANGE` tùy tiện, làm release bump major sai.

## Summary

- Atomic commit: một thay đổi logic, build và test pass tại commit đó.
- Message giải thích vì sao; tiêu đề ngắn, thể mệnh lệnh.
- Conventional Commits 1.0.0 cho phép tự động hóa version và changelog.
- `--fixup` cộng `rebase -i --autosquash` dọn commit trước khi chia sẻ.

## Self-check questions

1. Type nào trong Conventional Commits gây bump MINOR, và cái nào gây bump MAJOR?
2. Vì sao atomic commit giúp `bisect`?
3. Lệnh nào tạo commit fixup và lệnh nào áp dụng nó?
4. Với squash merge, cần kiểm soát message ở đâu?

<details><summary>Answer</summary>

1. `feat` ứng với MINOR; mọi type kèm `!` hoặc footer `BREAKING CHANGE:` ứng với MAJOR.
2. Mỗi commit build được và có một thay đổi, nên commit đầu tiên làm test fail chính là thủ phạm, không lẫn thay đổi khác.
3. `git commit --fixup <hash>` rồi `git rebase -i --autosquash <base>`.
4. Ở tiêu đề (và mô tả) của PR, vì đó là message của squash commit.

</details>
