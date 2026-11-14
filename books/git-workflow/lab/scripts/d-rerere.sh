. /work/scripts/lib.sh
git config --global rerere.enabled true
newrepo rerere
printf 'line1\nprice=10\nline3\n' > cfg.txt
git add cfg.txt
git commit -q -m "base"
git switch -q -c feature
printf 'line1\nprice=12\nline3\n' > cfg.txt
git commit -q -am "feature: price 12"
git switch -q main
printf 'line1\nprice=15\nline3\n' > cfg.txt
git commit -q -am "main: price 15"
git switch -q feature
echo "--- first rebase: conflict expected"
git rebase main || true
echo "--- resolve manually (merge both: 13) and continue"
printf 'line1\nprice=13\nline3\n' > cfg.txt
git add cfg.txt
git rebase --continue
echo "--- rerere recorded:"
ls .git/rr-cache | wc -l
echo "--- reset feature and rebase again: rerere should reuse the resolution"
git reset -q --hard ORIG_HEAD
git rebase main || true
echo "--- status after second rebase (conflict markers auto-resolved by rerere)"
git status --short
cat cfg.txt
git add cfg.txt
git rebase --continue
graph "after rerere"
