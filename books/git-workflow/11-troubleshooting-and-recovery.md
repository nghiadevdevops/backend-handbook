# Chương 11. Gỡ rối và cứu dữ liệu

## Vấn đề

Rồi sẽ có ngày bạn gõ `git reset --hard` nhầm, merge hỏng, hoặc production vỡ mà không biết commit nào gây ra. Git hiếm khi làm mất dữ liệu đã commit; công cụ cứu hộ có sẵn nếu biết dùng. Mọi output dưới đây là output thật chạy trong container `node:lts` (git 2.47.3), script nằm trong `lab/scripts/`.

## Conflict resolution và `rerere`

Conflict xảy ra khi hai nhánh sửa cùng vùng. Git đánh dấu:

```
<<<<<<< HEAD
price=15
=======
price=12
>>>>>>> feature
```

Sửa file thành kết quả đúng, `git add`, rồi `git merge --continue` hoặc `git rebase --continue`. Dùng `git rebase --abort`/`git merge --abort` để thoát. `git checkout --ours/--theirs <file>`: chú ý khi rebase, "ours" là nhánh đích (đang được replay lên), "theirs" là commit của bạn.

`rerere` (reuse recorded resolution) ghi nhớ cách bạn giải một conflict và tự áp lại khi gặp conflict giống hệt, hữu ích khi rebase nhánh dài nhiều lần hoặc khi merge rồi bỏ rồi merge lại. Bật: `git config --global rerere.enabled true`. Lab (d):

```
--- first rebase: conflict expected
Auto-merging cfg.txt
CONFLICT (content): Merge conflict in cfg.txt
Recorded preimage for 'cfg.txt'
--- resolve manually (merge both: 13) and continue
Recorded resolution for 'cfg.txt'.
Successfully rebased and updated refs/heads/feature.
--- reset feature and rebase again: rerere should reuse the resolution
CONFLICT (content): Merge conflict in cfg.txt
Resolved 'cfg.txt' using previous resolution.
--- status after second rebase
UU cfg.txt
line1
price=13
line3
```

Lần rebase thứ hai git vẫn báo CONFLICT, nhưng file đã được điền sẵn cách giải trước (`price=13`) và dòng "Resolved ... using previous resolution". Bạn vẫn phải `git add` để xác nhận (status còn `UU` đến lúc đó). Đặt `rerere.autoUpdate true` nếu muốn git tự `add`.

## `reflog`: cứu commit "mất"

`reflog` là nhật ký local của mọi lần HEAD (và từng branch) di chuyển, kể cả `reset`, `rebase`, `checkout`. Nó không được push, chỉ tồn tại trên máy bạn (mặc định giữ 90 ngày cho entry còn reachable, 30 ngày cho entry unreachable). Lab (e):

```
--- oops: reset --hard HEAD~2
8ac9420 feat: one
--- reflog
8ac9420 HEAD@{0}: reset: moving to HEAD~2
a49d3b6 HEAD@{1}: commit: feat: three (will be lost)
54ec7cd HEAD@{2}: commit: feat: two
8ac9420 HEAD@{3}: commit (initial): feat: one
--- rescue: reset --hard HEAD@{1}
a49d3b6 feat: three (will be lost)
54ec7cd feat: two
8ac9420 feat: one
```

Chỉ cứu được thứ **đã commit**; thay đổi chưa commit bị `reset --hard` thì không cứu được (trừ khi đã `stash` hoặc `git add` để có blob dangling: `git fsck --lost-found`).

## `reset`, `restore`, `switch`

| Việc | Lệnh |
|---|---|
| Bỏ stage một file | `git restore --staged <file>` |
| Bỏ thay đổi chưa commit của file | `git restore <file>` (không hoàn tác được) |
| Lấy file từ commit khác | `git restore --source=<rev> <file>` |
| Dời branch, giữ thay đổi ở working tree | `git reset --mixed <rev>` (mặc định) |
| Dời branch, giữ thay đổi đã stage | `git reset --soft <rev>` |
| Dời branch, bỏ hết | `git reset --hard <rev>` |
| Chuyển branch | `git switch <branch>`, `git switch -c <new>` |

`git restore` và `git switch` ra từ Git 2.23 để tách hai vai trò của `checkout`; `checkout` vẫn tồn tại và Git 3.0 không dự định bỏ nó.

## `revert`, kể cả revert merge commit

Với commit đã chia sẻ (ở trên `main`), **không** `reset`; dùng `git revert <hash>`, tạo commit mới đảo ngược. Với merge commit phải chỉ định parent mainline bằng `-m`: `-m 1` nghĩa là giữ lại phía parent đầu tiên (nhánh bạn đã merge vào). Lab (g):

```
*   66c9cd9 Merge feature/bad
|\
| * d98fe12 (feature/bad) feat: risky part 2
| * 1373199 feat: risky part 1
* | be093eb feat: unrelated work
|/
* e89ab29 feat: base
... git revert -m 1 --no-edit HEAD~1
* 2827178 (HEAD -> main) Revert "Merge feature/bad"
* ca6a028 feat: work after merge
*   66c9cd9 Merge feature/bad
```

File `bad.txt` biến mất, nhưng **lịch sử vẫn nói rằng nhánh đó đã được merge**. Hệ quả kinh điển: nếu sau đó sửa lỗi trên `feature/bad` và merge lại, git bỏ qua các commit cũ vì coi như đã có. Cách xử lý: trước khi merge lại, "revert của revert" (`git revert 2827178`) để mang các thay đổi cũ trở lại, rồi merge các commit sửa.

## `bisect` và `bisect run`

Tìm commit gây lỗi bằng tìm nhị phân: O(log n) bước. Tự động hóa bằng script trả exit code 0 (tốt), 1-127 trừ 125 (xấu), 125 (bỏ qua commit này). Lab (f), test kiểm tra `calc.txt`, 9 commit:

```
git bisect start HEAD <commit-đầu>
git bisect run ./test.sh
running './test.sh'
Bisecting: 0 revisions left to test after this (roughly 0 steps)
0f8c92e5a1404de06af3d98fc7c4fff28042aef6 is the first bad commit
    refactor: change total (bug)
bisect found first bad commit
```

Chỉ 3 lần chạy test cho 9 commit. Bisect cần commit atomic và build được (Chương 7). Kết thúc bằng `git bisect reset`.

## `stash` và `worktree`

```sh
git stash push -m "wip search" -- src/search.ts   # chỉ stash vài file
git stash list
git stash pop                                     # hoặc apply, giữ stash lại
git stash push -u                                 # kèm file untracked
```

`git worktree` cho nhiều working directory từ cùng một repo (chung object store): xem PR khác hoặc fix hotfix mà không stash công việc đang dở.

```sh
git worktree add ../orders-hotfix -b hotfix/1.4.1 v1.4.0
git worktree list
git worktree remove ../orders-hotfix
```

Mỗi branch chỉ checkout được ở một worktree tại một thời điểm.

## `cherry-pick` và các lệnh hay quên

- `git cherry-pick -x <hash>`; `git cherry-pick --abort`.
- `git reflog expire` và `git gc` chỉ chạy khi bạn chủ ý; đừng chạy `--expire=now --prune=now` khi chưa chắc.
- `git blame -w -C -C`, `git log -S 'text'`, `git log -L :func:file` giúp lần dấu code.
- `git restore -p` hoặc `git add -p` làm việc theo hunk.

## Cạm bẫy

- `reset --hard` với thay đổi chưa commit: mất thật.
- Force push để "sửa" `main` khi một `revert` là đủ.
- `bisect run` với test flaky cho kết quả sai; dùng test xác định.
- Revert merge xong merge lại cùng nhánh mà không "revert của revert".
- Chạy `git gc --prune=now` xong mới nhận ra cần reflog.

## Tóm tắt

- `rerere` ghi nhớ cách giải conflict và tự điền lại ở lần sau (vẫn cần `git add`).
- `reflog` cứu commit sau `reset --hard`; không cứu được thay đổi chưa commit.
- Trên nhánh đã chia sẻ dùng `revert`; revert merge cần `-m 1`.
- `bisect run` với script tìm commit lỗi trong O(log n) lần test.

## Câu hỏi tự kiểm tra

1. Sau `git reset --hard HEAD~3` nhầm, làm gì để lấy lại?
2. Vì sao `git revert` merge commit cần `-m`?
3. Exit code nào trong `bisect run` nghĩa là "bỏ qua commit"?
4. Khác nhau giữa `reset --soft`, `--mixed` và `--hard`?

<details><summary>Đáp án</summary>

1. `git reflog`, tìm entry trước khi reset, rồi `git reset --hard HEAD@{n}` (hoặc hash).
2. Merge commit có hai parent; git không biết phía nào là mainline để giữ, `-m 1` chọn parent đầu.
3. 125.
4. `--soft` giữ index và working tree; `--mixed` giữ working tree, xóa index; `--hard` xóa cả hai.

</details>
