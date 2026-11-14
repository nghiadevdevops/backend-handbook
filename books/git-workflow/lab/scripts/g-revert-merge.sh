. /work/scripts/lib.sh
newrepo revertmerge
commit_file app.txt "base" "feat: base"
git switch -q -c feature/bad
commit_file bad.txt "bad1" "feat: risky part 1"
commit_file bad.txt "bad2" "feat: risky part 2"
git switch -q main
commit_file app.txt "other" "feat: unrelated work"
git merge -q --no-ff feature/bad -m "Merge feature/bad"
commit_file app.txt "after" "feat: work after merge"
graph "before revert"
echo "--- revert merge: -m 1 keeps mainline parent"
git revert -m 1 --no-edit HEAD~1
ls
graph "after revert"
