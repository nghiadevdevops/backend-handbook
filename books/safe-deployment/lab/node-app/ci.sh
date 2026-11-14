#!/bin/sh
# Runs inside node:26-slim with node-app mounted at /app: install, type-check/build, test.
set -e
cd /app
npm ci
npx tsc
node --test dist/
rm -rf node_modules dist
