#!/bin/sh
# Entry point of the server container: copy the read-only source, install deps, run.
set -e
mkdir -p /app && cp -r /src/. /app/ && cd /app
npm ci --omit=dev --no-audit --no-fund
exec node index.ts
