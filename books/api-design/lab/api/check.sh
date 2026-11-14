#!/bin/sh
# Typecheck with tsc inside a container (source mounted read-only at /src).
set -e
mkdir -p /app && cp -r /src/. /app/ && cd /app
npm ci --no-audit --no-fund
npx tsc --noEmit && echo "tsc: 0 errors"
