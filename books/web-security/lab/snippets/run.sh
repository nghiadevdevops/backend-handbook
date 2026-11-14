#!/bin/sh
# Chạy trong container node: cài vào /srv (mount read-only nên không ghi vào host), chạy các demo.
set -e
cp -r /snippets/. /srv
cd /srv
npm install --no-audit --no-fund --loglevel=error
echo "--- password.ts ---"
node demo-password.ts
echo "--- jwt.ts ---"
node jwt.ts
echo "--- ssrf.ts ---"
node demo-ssrf.ts
echo "--- log.ts ---"
node log.ts
