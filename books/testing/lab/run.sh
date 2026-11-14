#!/usr/bin/env bash
# Lab "Testing cho Hexagonal" (TypeScript) - runs entirely in Docker.
# Usage: ./run.sh up | install | typecheck | unit | app | accept | http | integ | contract | pact | all | mutation | trace | e2e | down
# Every resource is prefixed bookcheck-testts-
set -euo pipefail
cd "$(dirname "$0")"

IMG=node:26
PW_IMG=mcr.microsoft.com/playwright:v1.65.0-noble
NET=bookcheck-testts-net
PG=bookcheck-testts-pg
NM=bookcheck-testts-node-modules
LAB_DIR="$(pwd)"
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: do not rewrite -v paths

node_run() {  # node_run <command...>   (one docker command, run inside the lab)
  timeout "${RUN_TIMEOUT:-600}" docker run --rm --name "bookcheck-testts-run-$$-$RANDOM" --memory 2g --network "$NET" \
    -e DATABASE_URL="postgres://app:app@$PG:5432/app" -e CI=true -e NO_COLOR=1 \
    -v "$LAB_DIR":/app -v "$NM":/app/node_modules -w /app "$IMG" "$@"
}

case "${1:-all}" in
  up)
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"
    docker volume inspect "$NM" >/dev/null 2>&1 || docker volume create "$NM"
    docker rm -f "$PG" >/dev/null 2>&1 || true
    docker run -d --name "$PG" --network "$NET" --memory 256m \
      -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app \
      postgres:18-alpine >/dev/null
    until docker exec "$PG" pg_isready -U app -d app >/dev/null 2>&1; do sleep 1; done
    echo "PostgreSQL ready" ;;
  install)   if [ -f package-lock.json ]; then node_run npm ci --no-audit --no-fund; else node_run npm install --no-audit --no-fund; fi ;;
  typecheck) node_run npx tsc --noEmit ;;
  unit)      node_run npx vitest run tests/unit ;;
  app)       node_run npx vitest run tests/application ;;
  accept)    node_run npx vitest run tests/acceptance ;;
  http)      node_run npx vitest run tests/http ;;
  integ)     node_run npx vitest run tests/integration ;;
  charact)   node_run npx vitest run tests/characterization ;;
  contract)  node_run npx vitest run tests/contract ;;
  pact)      node_run npx vitest run tests/contract/pact ;;
  all)       node_run npx vitest run ;;
  mutation)  RUN_TIMEOUT=1500 node_run npx stryker run 2>&1 | tee reports/stryker.log ;;
  exec)      node_run "${@:2}" ;;
  trace)     node_run sh scripts/trace.sh ;;
  e2e)
    timeout 900 docker run --rm --name "bookcheck-testts-e2e-$$" --memory 2g --ipc=host \
      -v "$LAB_DIR":/app -v "$NM":/app/node_modules -w /app "$PW_IMG" npx playwright test ;;
  down)
    docker rm -f "$PG" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    docker volume rm "$NM" >/dev/null 2>&1 || true
    rm -rf node_modules .stryker-tmp reports test-results playwright-report pacts
    echo "Cleaned up" ;;
  *) echo "Unknown command"; exit 1 ;;
esac
