# Shared helpers, sourced by every lab script (POSIX sh).
set -e
git config --global user.name "Dev"
git config --global user.email "dev@example.com"
git config --global init.defaultBranch main
git config --global advice.detachedHead false
git config --global core.editor true
git config --global pull.rebase false
# commit_file <file> <line> <message>
commit_file() {
  echo "$2" >> "$1"
  git add "$1"
  git commit -q -m "$3"
}
newrepo() {
  rm -rf "/tmp/$1"
  mkdir -p "/tmp/$1"
  cd "/tmp/$1"
  git init -q
}
graph() {
  echo "--- git log --graph --oneline --all --decorate ($1)"
  git log --graph --oneline --all --decorate
}
