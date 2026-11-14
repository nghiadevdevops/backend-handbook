#!/bin/sh
# Chạy trong container node: kiểm tra kiểu, chạy 13 acceptance test, kiểm tra AC coverage.
#   docker run --rm -v "$PWD:/w" -w /w node:lts sh scripts/verify.sh
set -e
node --version
npm install --no-audit --no-fund
npx tsc --noEmit
echo "tsc --noEmit: OK"
npm test
sh scripts/check-ac-coverage.sh
