#!/bin/sh
# Copy ra /srv (thu muc mount la read-only), cai dung theo lockfile roi chay.
set -e
cp -r /app/. /srv
cd /srv
npm ci --omit=dev --no-audit --no-fund
exec node server.ts
