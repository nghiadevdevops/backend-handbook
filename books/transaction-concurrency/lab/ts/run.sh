#!/bin/sh
# Runs inside the node container: install in a scratch copy, typecheck, run the demo.
set -e
cp -r /app /tmp/build
cd /tmp/build
npm install --no-audit --no-fund
npx tsc --noEmit
node --version
timeout 60 node src/demo.ts
