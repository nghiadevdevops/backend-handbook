. /work/scripts/lib.sh
newrepo autosquash
commit_file app.txt "base" "feat: base"
git switch -q -c feature
commit_file a.txt "a" "feat(a): add a"
commit_file b.txt "b" "feat(b): add b"
bad=$(git log --format=%h --grep='add a')
echo "--- found typo in commit 'add a': create a fixup"
echo "a-fixed" > a.txt
git add a.txt
git commit -q --fixup "$bad"
git log --oneline
echo "--- rebase -i --autosquash (non-interactive)"
GIT_SEQUENCE_EDITOR=: git rebase -q -i --autosquash main
git log --oneline
echo "--- content of a.txt:"
cat a.txt
