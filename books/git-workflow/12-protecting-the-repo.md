# Chapter 12. Protecting the Repo

## The problem

Ai đó commit file `.env` chứa API key, nó nằm trong history và ai cũng clone được. Hoặc commit mạo danh tác giả. Hoặc cả team có file `\r\n` lẫn `\n` và mỗi PR đổi cả nghìn dòng. Chương này gom các lớp bảo vệ: secret, chữ ký, `.gitignore`/`.gitattributes`, và hooks.

## Secrets leaked in history

Thứ tự bắt buộc:

1. **Rotate (thu hồi và cấp lại) secret trước tiên.** Coi secret đã lộ ngay khi push lên remote; xóa khỏi history không làm nó hết hiệu lực, vì bản clone, fork, cache, log CI có thể đã giữ nó.
2. Kiểm tra log truy cập của dịch vụ liên quan để xem có bị dùng không.
3. Dọn history bằng **git-filter-repo** (công cụ git khuyến nghị thay `git filter-branch`; bản mới nhất tra được: v2.47.0, 12/2024, ít cập nhật nhưng ổn định):

```sh
# xóa hẳn một file khỏi mọi commit
git filter-repo --invert-paths --path config/.env

# thay chuỗi trong mọi file/commit; expressions.txt: mỗi dòng "literal:SECRET==>REDACTED"
git filter-repo --replace-text expressions.txt
```

   `filter-repo` viết lại toàn bộ hash, nên chạy trên một bản clone mới, rồi `git push --force --all` và `--tags`; mọi người phải clone lại (hoặc reset cứng). GitHub vẫn có thể giữ commit cũ qua pull request refs và cache nên cần liên hệ GitHub Support để xóa cached views nếu secret nhạy cảm (chi tiết quy trình xem docs GitHub "Removing sensitive data from a repository").
4. Ngăn tái phát: secret scanning và push protection của GitHub, cộng quét trong pre-commit/CI bằng công cụ như gitleaks (chưa tra phiên bản trong phiên viết sách này).

Phòng bệnh tốt hơn chữa: `.env` vào `.gitignore` ngay từ đầu, dùng secret manager hoặc biến môi trường CI.

## Commit signing

Chữ ký chứng minh commit do chủ key tạo; GitHub hiển thị nhãn "Verified". Ba cách:

**GPG** (truyền thống): quản lý key phức tạp.

```sh
git config --global user.signingkey <KEYID>
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

**SSH signing** (Git 2.34 trở lên): dùng chính SSH key sẵn có, đơn giản nhất cho nhiều team.

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
# để tự xác minh local:
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
```

Thêm public key vào GitHub với loại "Signing Key" để hiện Verified.

**gitsign / Sigstore** (keyless): ký bằng danh tính OIDC (GitHub, Google) và chứng chỉ ngắn hạn từ Fulcio, ghi vào Rekor transparency log; không cần giữ private key lâu dài.

```sh
git config --local commit.gpgsign true
git config --local tag.gpgsign true
git config --local gpg.x509.program gitsign
git config --local gpg.format x509
```

gitsign mới nhất tra được là v0.18.0 (20/10/2026), còn phát triển (kiểu `gitsign verify` và cấu hình chi tiết nên đọc README của repo `sigstore/gitsign`). Hợp khi cần chuỗi cung ứng minh bạch; đổi lại phụ thuộc dịch vụ Sigstore trực tuyến lúc ký.

Bật "Require signed commits" trong ruleset chỉ có tác dụng khi cả team đã cấu hình ký; với squash merge trên giao diện GitHub, commit squash do GitHub ký bằng key của chính GitHub.

## `.gitignore` and `.gitattributes`

`.gitignore` chỉ ảnh hưởng file chưa được track; file đã commit phải `git rm --cached`. Template gợi ý: `node_modules/`, `dist/`, `.env*` (cùng `!.env.example`), binary Go (`/bin/`), `*.test`, `coverage/`.

**Line ending trên Windows**: Windows dùng CRLF, Linux/macOS dùng LF. Cách đáng tin cậy là đặt chính sách trong repo bằng `.gitattributes`, thay vì để từng máy tự cấu hình `core.autocrlf`:

```
# .gitattributes
* text=auto eol=lf
*.sh text eol=lf
*.ps1 text eol=crlf
*.png binary
*.go text eol=lf diff=golang
package-lock.json -diff
```

`* text=auto` để git tự nhận file văn bản; `eol=lf` ép checkout dùng LF trên mọi OS (shell script có CRLF sẽ lỗi trong container Linux: `bad interpreter`). Sau khi thêm `.gitattributes` vào repo cũ, chạy `git add --renormalize .` rồi commit một lần riêng để chuẩn hóa. Với Go, `gofmt` dùng LF; editor trên Windows cần cấu hình tương ứng.

## Hooks for lint, test, commitlint

Hook nằm trong `.git/hooks` nên không được commit; các tool quản lý hook giải quyết việc chia sẻ:

| Tool | Cách dùng | Phiên bản tra được |
|---|---|---|
| husky | npm package; `npx husky init`, file trong `.husky/` | 9.1.7 trên npm (release GitHub cuối 11/2024) |
| lefthook | binary Go, cấu hình `lefthook.yml`, cài qua npm hoặc Go, chạy song song | v2.2.2 (13/10/2026) |

Husky gắn vào hệ sinh thái npm, đơn giản cho dự án TS. Lefthook không phụ thuộc Node (hợp polyglot, dự án Go) và chạy lệnh song song, hỗ trợ `{staged_files}`, `glob`. Lab (i) `lab/scripts/i-hooks.sh` dùng lefthook cùng commitlint (`@commitlint/cli` 21.2.4), cài package trong container. Output thật:

```
commit-msg: commitlint ❯
fixed stuff
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
✖   found 2 problems, 0 warnings
(commit rejected, as expected)
--- good message accepted
✔️ commitlint (0.43 seconds)
[main 2b2977c] feat: add a
--- pre-commit hook blocks console.log
no-console-log ❯ 1:console.log("debug")
(commit rejected by pre-commit, as expected)
```

Cấu hình đã dùng:

```yaml
# lefthook.yml
commit-msg:
  commands:
    commitlint:
      run: npx --no -- commitlint --edit {1}
pre-commit:
  commands:
    no-console-log:
      glob: "*.ts"
      run: "! grep -n 'console.log' {staged_files}"
```

```js
// commitlint.config.mjs
export default { extends: ['@commitlint/config-conventional'] };
```

**Cân nhắc chạy nhanh**: hook chậm khiến người ta dùng `--no-verify`. Quy tắc: pre-commit chỉ chạy việc nhanh trên file staged (format, lint, kiểm tra secret; dưới vài giây); pre-push hoặc CI chạy test đầy đủ; `commit-msg` chạy commitlint. Hook là hỗ trợ cục bộ, không phải rào chắn: CI và ruleset mới là nơi **bắt buộc** (hook bypass được bằng `--no-verify`).

## Pitfalls

- Chỉ xóa file chứa secret ở commit mới, không dọn history lẫn rotate.
- Rewrite history xong mà quên báo team; người khác push lại commit cũ.
- Hook nặng (chạy cả test suite) mỗi commit.
- `core.autocrlf` mỗi người một kiểu, không có `.gitattributes`.
- Require signed commits trong ruleset khi chưa ai cấu hình ký: chặn cả team.

## Summary

- Secret lộ: rotate trước, rồi mới dọn history bằng git-filter-repo.
- Ký commit bằng SSH signing là cách dễ nhất; gitsign cho keyless.
- `.gitattributes` với `* text=auto eol=lf` chấm dứt chuyện line ending.
- Hook (husky/lefthook) cho phản hồi nhanh; CI và ruleset mới bắt buộc thật sự.

## Self-check questions

1. Vì sao rotate secret phải đi trước khi xóa khỏi history?
2. SSH signing cần Git phiên bản nào trở lên?
3. Vì sao hook không thể là cơ chế bắt buộc duy nhất?
4. Dòng `.gitattributes` nào ép LF cho mọi file văn bản?

<details><summary>Answer</summary>

1. Secret đã lộ có thể bị lấy từ clone, fork, cache; xóa history không thu hồi nó.
2. Git 2.34.
3. Có thể bỏ qua bằng `--no-verify` hoặc không cài hook; kiểm soát bắt buộc phải ở CI và ruleset phía server.
4. `* text=auto eol=lf`.

</details>
