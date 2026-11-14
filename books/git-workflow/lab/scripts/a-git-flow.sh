. /work/scripts/lib.sh
git --version
newrepo flow
commit_file orders.txt "create order" "feat: initial orders module"
git tag -a v1.0.0 -m "Release 1.0.0"
git switch -q -c develop
# feature
git switch -q -c feature/search develop
commit_file search.txt "search by id" "feat(search): search by id"
commit_file search.txt "search by date" "feat(search): search by date"
git switch -q develop
git merge -q --no-ff feature/search -m "Merge feature/search into develop"
git branch -d feature/search
# release
git switch -q -c release/1.1.0 develop
commit_file VERSION "1.1.0" "chore(release): bump version to 1.1.0"
git switch -q main
git merge -q --no-ff release/1.1.0 -m "Merge release/1.1.0 into main"
git tag -a v1.1.0 -m "Release 1.1.0"
git switch -q develop
git merge -q --no-ff release/1.1.0 -m "Merge release/1.1.0 back into develop"
git branch -d release/1.1.0
# hotfix
git switch -q -c hotfix/1.1.1 main
commit_file orders.txt "null check" "fix(orders): handle empty order"
git switch -q main
git merge -q --no-ff hotfix/1.1.1 -m "Merge hotfix/1.1.1 into main"
git tag -a v1.1.1 -m "Hotfix 1.1.1"
git switch -q develop
git merge -q --no-ff hotfix/1.1.1 -m "Merge hotfix/1.1.1 back into develop"
git branch -d hotfix/1.1.1
graph "git flow"
echo "--- tags"
git tag -n
