. /work/scripts/lib.sh
newrepo trunk
commit_file orders.txt "create order" "feat: initial orders module"
for n in cancel refund export; do
  git switch -q -c "short/$n"
  commit_file "$n.txt" "wip $n" "wip: $n part 1"
  commit_file "$n.txt" "done $n" "wip: $n part 2"
  git switch -q main
  git merge -q --squash "short/$n"
  git commit -q -m "feat($n): add $n support"
  git branch -D "short/$n" >/dev/null
done
git tag -a v1.3.0 -m "Release 1.3.0 from trunk"
commit_file orders.txt "tweak" "fix(orders): trim whitespace"
graph "trunk-based"
echo "--- tags"
git tag -n
