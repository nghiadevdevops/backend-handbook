. /work/scripts/lib.sh
# Same starting history for the three strategies: A-B on main, F1,F2 on feature, C on main.
setup() {
  newrepo "$1"
  commit_file app.txt "A" "A: initial"
  commit_file app.txt "B" "B: second"
  git switch -q -c feature
  commit_file f1.txt "f1" "F1: feature part 1"
  commit_file f2.txt "f2" "F2: feature part 2"
  git switch -q main
  commit_file c.txt "c" "C: main moves on"
}
setup s-merge
git merge -q --no-ff feature -m "M: merge feature"
graph "merge"
setup s-rebase
git switch -q feature
git rebase -q main
git switch -q main
git merge -q --ff-only feature
graph "rebase then fast-forward"
setup s-squash
git merge -q --squash feature
git commit -q -m "S: feature (F1+F2 squashed)"
graph "squash"
