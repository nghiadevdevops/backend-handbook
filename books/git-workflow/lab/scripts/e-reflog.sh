. /work/scripts/lib.sh
newrepo reflog
commit_file app.txt "one" "feat: one"
commit_file app.txt "two" "feat: two"
commit_file app.txt "three" "feat: three (will be lost)"
lost=$(git rev-parse --short HEAD)
echo "--- oops: reset --hard HEAD~2"
git reset -q --hard HEAD~2
git log --oneline
echo "--- reflog"
git reflog
echo "--- rescue: reset --hard HEAD@{1}"
git reset -q --hard "HEAD@{1}"
git log --oneline
echo "lost commit was $lost"
