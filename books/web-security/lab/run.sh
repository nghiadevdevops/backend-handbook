#!/usr/bin/env bash
# Lab bảo mật web (Node 26 + Express 5 + PostgreSQL). Chỉ dùng container/network có tiền tố bookcheck-sec-. Không map port.
# Chạy:  bash run.sh        (từ thư mục lab/; cần app/package-lock.json, xem README)
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")"
HERE="$(pwd -W 2>/dev/null || pwd)"
NET=bookcheck-sec-net
APP=bookcheck-sec-app
DB=bookcheck-sec-db
NODE_IMG=node:lts-alpine
T="timeout 600"

cleanup() { $T docker rm -f $APP $DB >/dev/null 2>&1; $T docker network rm $NET >/dev/null 2>&1; }
trap cleanup EXIT
cleanup

$T docker network create $NET >/dev/null
$T docker run -d --name $DB --network $NET --memory 256m -e POSTGRES_PASSWORD=lab-only postgres:18 >/dev/null
$T docker run -d --name $APP --network $NET --memory 256m -v "$HERE/app:/app:ro" $NODE_IMG sh /app/start.sh >/dev/null

# chờ app log "listening"
for i in $(seq 1 90); do
  docker logs $APP 2>&1 | grep -q listening && break
  sleep 2
done
docker logs $APP 2>&1 | tail -3

# c: chạy curl từ một container khác trong cùng network
c() { echo "\$ curl $*"; $T docker run --rm --network $NET --memory 32m curlimages/curl -s -i "$@"; echo; echo "-----"; }
B=http://$APP:8080

echo "=== 1. SQL injection ==="
c -G "$B/vuln/books" --data-urlencode "q=Clean"
c -G "$B/vuln/books" --data-urlencode "q=zzz' UNION SELECT id, password_hash, is_admin FROM users --"
c -G "$B/vuln/books" --data-urlencode "q='"
c -G "$B/fixed/books" --data-urlencode "q=zzz' UNION SELECT id, password_hash, is_admin FROM users --"

echo "=== 2. Stored XSS ==="
c -X POST "$B/vuln/comments" --data-urlencode 'body=<img src=x onerror=alert(document.domain)>'
c "$B/vuln/comments"
c -X POST "$B/fixed/comments" --data-urlencode 'body=<img src=x onerror=alert(document.domain)>'
c "$B/fixed/comments"

echo "=== 3. IDOR / BOLA (alice đọc đơn của bob) ==="
c -H "Authorization: Bearer tok-alice" "$B/vuln/orders/2"
c -H "Authorization: Bearer tok-alice" "$B/fixed/orders/2"
c -H "Authorization: Bearer tok-alice" "$B/fixed/orders/1"

echo "=== 4. Mass assignment (alice tự nâng quyền) ==="
c -H "Authorization: Bearer tok-alice" "$B/admin/secret"
c -X POST -H "Authorization: Bearer tok-alice" -H "Content-Type: application/json" -d '{"name":"alice","is_admin":1}' "$B/fixed/profile"
c -H "Authorization: Bearer tok-alice" "$B/admin/secret"
c -X POST -H "Authorization: Bearer tok-alice" -H "Content-Type: application/json" -d '{"name":"alice","is_admin":1}' "$B/vuln/profile"
c -H "Authorization: Bearer tok-alice" "$B/admin/secret"

echo "=== 5. Prototype pollution (chạy cuối vì làm bẩn process) ==="
c "$B/legacy/panel"
c -X POST -H "Content-Type: application/json" -d '{"__proto__":{"isAdmin":true}}' "$B/fixed/settings"
c "$B/legacy/panel"
c -X POST -H "Content-Type: application/json" -d '{"__proto__":{"isAdmin":true}}' "$B/vuln/settings"
c "$B/legacy/panel"

echo "=== 6. npm audit ==="
$T docker run --rm --memory 512m -v "$HERE/audit:/work:ro" $NODE_IMG sh /work/audit.sh
