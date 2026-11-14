#!/bin/sh
# Tao lockfile trong thu muc tam (khong cai node_modules), roi audit lockfile.
cp /work/package.json /tmp/
cd /tmp
npm install --package-lock-only --ignore-scripts --no-fund --no-audit 2>&1 | tail -2
npm audit --package-lock-only > /tmp/audit.txt 2>&1
echo "exit code npm audit: $?"
head -150 /tmp/audit.txt
