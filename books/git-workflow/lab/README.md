# Lab: Git workflow

Mọi lệnh git chạy BÊN TRONG Docker (image `node:lts`, đã có git; bản dùng khi viết sách: git 2.47.3 của Debian trong image, mới nhất của git upstream là 2.56.0). Không chạy git trên host. Script chỉ cần mount thư mục `lab/` ở chế độ chỉ đọc; repo tạm nằm trong `/tmp` của container và biến mất khi container thoát (`--rm`).

## Chạy

Từ thư mục `lab/` (Git Bash trên Windows cần `MSYS_NO_PATHCONV=1` để không bị đổi đường dẫn):

```sh
MSYS_NO_PATHCONV=1 timeout 600 docker run --rm --name bookcheck-git-a \
  -v "$(pwd):/work:ro" node:lts sh /work/scripts/a-git-flow.sh
```

Đổi `a-git-flow.sh` thành script khác. Mỗi lệnh chỉ gồm một lệnh `docker`.

| Script | Nội dung | Chương |
|---|---|---|
| `scripts/a-git-flow.sh` | Git Flow đầy đủ: feature, develop, release, main + tag, hotfix và back-merge | 3 |
| `scripts/b-trunk-based.sh` | Trunk-based: short-lived branch, squash merge, tag từ trunk | 5 |
| `scripts/c-merge-rebase-squash.sh` | Merge, rebase, squash trên cùng một lịch sử | 2 |
| `scripts/d-rerere.sh` | Conflict khi rebase, `rerere` tự áp lại cách giải | 11 |
| `scripts/e-reflog.sh` | Cứu commit sau `reset --hard` bằng reflog | 11 |
| `scripts/f-bisect.sh` | `git bisect run` với test script | 11 |
| `scripts/g-revert-merge.sh` | `git revert -m 1` một merge commit | 11 |
| `scripts/h-autosquash.sh` | `--fixup` và `rebase -i --autosquash` không tương tác | 7 |
| `scripts/i-hooks.sh` | commitlint cộng lefthook (cài package trong container, cần mạng) | 12 |

`scripts/lib.sh` chứa hàm dùng chung (cấu hình user, `commit_file`, `newrepo`, `graph`).

## Dọn dẹp

Dùng `--rm` nên container tự xóa. Kiểm tra: `docker ps -a --filter name=bookcheck-git-`. Không có volume, network hay `node_modules` trên host (script `i-hooks.sh` cài package trong `/tmp` của container).

## Lưu ý

- Hash commit trong output của sách sẽ khác khi bạn chạy lại (timestamp khác); cấu trúc graph giống nhau.
- Script dùng `core.editor true` để không mở editor.
