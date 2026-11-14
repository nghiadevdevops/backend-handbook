. /work/scripts/lib.sh
newrepo bisect
cat > test.sh <<'T'
#!/bin/sh
# exit 0 = good, non-zero = bad
grep -q '^total=3$' calc.txt
T
chmod +x test.sh
echo "total=3" > calc.txt
git add . 
git commit -q -m "feat: calc total=3"
for i in 1 2 3 4; do commit_file notes.txt "n$i" "chore: note $i"; done
echo "total=4" > calc.txt
git commit -q -am "refactor: change total (bug)"
for i in 5 6 7; do commit_file notes.txt "n$i" "chore: note $i"; done
git log --oneline
echo "--- bisect run"
git bisect start HEAD "$(git rev-list --max-parents=0 HEAD)"
git bisect run ./test.sh
git bisect reset
