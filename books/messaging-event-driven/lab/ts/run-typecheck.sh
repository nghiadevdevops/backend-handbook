#!/bin/sh
# Chạy trong container node: sh /app/run-typecheck.sh
# --ignore-scripts: chỉ cần file .d.ts để typecheck, bỏ qua bước build native của librdkafka.
set -e
cd /app
npm install --ignore-scripts --no-audit --no-fund
npx tsc --noEmit
echo "tsc --noEmit: OK"
