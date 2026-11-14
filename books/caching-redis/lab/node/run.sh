#!/bin/sh
# Usage: sh /app/run.sh   (inside bookcheck-cache-node)
set -e
npm install --no-audit --no-fund
npx tsc --noEmit
echo "tsc OK"
node src/demo.ts
