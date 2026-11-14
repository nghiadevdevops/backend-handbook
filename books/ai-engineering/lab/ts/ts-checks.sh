#!/bin/sh
# Chạy BÊN TRONG container node. Copy mã sang /work để cài package không ghi vào thư mục mount.
set -eu
mkdir -p /work && cp -r /app/src /app/data /app/package.json /app/tsconfig.json /work/
cd /work
npm install --no-audit --no-fund --silent
echo "== tsc --noEmit =="
npx tsc --noEmit
echo "tsc: OK"
echo "== EvalRunner (ask giả) =="
node src/demoEval.ts
echo "== AgentLoop (client giả) =="
node src/demoAgentLoop.ts
echo "== MCP stdio server + client test =="
node src/demoMcpClient.ts
if [ -n "${DATABASE_URL:-}" ]; then
  echo "== pgvector + lookup_order + POST /ask =="
  node src/demoPg.ts
fi
