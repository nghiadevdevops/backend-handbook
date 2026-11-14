. /work/scripts/lib.sh
newrepo hooks
npm init -y >/dev/null
npm install --silent --no-audit --no-fund -D @commitlint/cli @commitlint/config-conventional lefthook
printf 'node_modules\n' > .gitignore
echo "export default { extends: ['@commitlint/config-conventional'] };" > commitlint.config.mjs
cat > lefthook.yml <<'Y'
commit-msg:
  commands:
    commitlint:
      run: npx --no -- commitlint --edit {1}
pre-commit:
  commands:
    no-console-log:
      glob: "*.ts"
      run: "! grep -n 'console.log' {staged_files}"
Y
npx lefthook install
git add .
git -c core.hooksPath=/dev/null commit -q -m "chore: setup hooks"
echo "--- bad message must be rejected"
echo "x" > a.txt
git add a.txt
git commit -m "fixed stuff" || echo "(commit rejected, as expected)"
echo "--- good message accepted"
git commit -m "feat: add a"
git log --oneline
echo "--- pre-commit hook blocks console.log"
echo 'console.log("debug")' > app.ts
git add app.ts
git commit -m "feat: add app" || echo "(commit rejected by pre-commit, as expected)"
echo "--- versions"
npx commitlint --version
npx lefthook version
