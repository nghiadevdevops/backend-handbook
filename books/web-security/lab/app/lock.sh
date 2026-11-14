#!/bin/sh
# Sinh package-lock.json (chay mot lan, can mount app/ co quyen ghi)
cd /app
npm install --package-lock-only --ignore-scripts --no-fund --no-audit
