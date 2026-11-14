#!/usr/bin/env bash
# Chạy API trong container, gọi bằng curl từ container khác cùng network. Không map port ra host.
# Dùng: bash run-api.sh   (kết quả in ra stdout, thêm `| tee transcript.md` nếu muốn lưu)
set -u
cd "$(dirname "$0")"
NET=bookcheck-apits-net; SRV=bookcheck-apits-server
APIDIR="$(pwd)/api"
case "$(uname -s)" in MINGW*|MSYS*) APIDIR="$(cygpath -m "$APIDIR")"; export MSYS_NO_PATHCONV=1;; esac

cleanup() { docker rm -f "$SRV" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
trap cleanup EXIT
cleanup
timeout 60 docker network create "$NET" >/dev/null
timeout 60 docker run -d --name "$SRV" --network "$NET" --memory 256m \
  -v "$APIDIR:/src:ro" -w /src \
  node:26-alpine sh /src/start.sh >/dev/null
# wait until the server logs that it is listening (npm ci runs first)
for _ in $(seq 1 60); do docker logs "$SRV" 2>&1 | grep -q "listening on 8080" && break; sleep 2; done

# $@ = lệnh curl (không kèm URL gốc); in ra lệnh và kết quả
c() {
  echo; echo '$ curl' "$@"
  timeout 30 docker run --rm --network "$NET" --memory 32m curlimages/curl:latest \
    -sS -i "$@" | sed 's/\r$//'
}
B=http://$SRV:8080
J='Content-Type: application/json'

echo "## 1. Thiếu Idempotency-Key -> 400"
c -X POST $B/orders -H "$J" -d '{"items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}]}'

echo; echo "## 2. Validation lỗi -> 422 (RFC 9457 + errors[])"
c -X POST $B/orders -H "$J" -H 'Idempotency-Key: k-bad' -d '{"items":[{"quantity":0,"unit_price":10}]}'

echo; echo "## 3. Tạo đơn lần đầu -> 201 + ETag + Location"
BODY='{"items":[{"sku":"BOOK-1","quantity":2,"unit_price":150000}],"note":"giao gio hanh chinh"}'
c -X POST $B/orders -H "$J" -H 'Idempotency-Key: key-0001' -d "$BODY"

echo; echo "## 4. Gửi lại cùng key + cùng body -> phát lại 201, không tạo đơn mới"
c -X POST $B/orders -H "$J" -H 'Idempotency-Key: key-0001' -d "$BODY"

echo; echo "## 5. Cùng key, body khác -> 422"
c -X POST $B/orders -H "$J" -H 'Idempotency-Key: key-0001' -d '{"items":[{"sku":"BOOK-9","quantity":1,"unit_price":1}]}'

echo; echo "## 6. Race: 2 request cùng key, request đầu bị giữ 2 giây -> request sau nhận 409"
B2='{"items":[{"sku":"PEN-1","quantity":1,"unit_price":5000}]}'
( c -X POST $B/orders -H "$J" -H 'Idempotency-Key: key-race' -H 'X-Demo-Delay: 2' -d "$B2" > /tmp/race1.txt ) &
sleep 1
c -X POST $B/orders -H "$J" -H 'Idempotency-Key: key-race' -d "$B2"
wait
echo; echo "(response của request đầu)"; cat /tmp/race1.txt

echo; echo "## 7. Đọc đơn -> ETag"
c $B/orders/ord_0001

ETAG=$(timeout 30 docker run --rm --network "$NET" curlimages/curl:latest -si $B/orders/ord_0001 | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')
echo; echo "## 8. GET có If-None-Match -> 304"
c $B/orders/ord_0001 -H "If-None-Match: $ETAG"

echo; echo "## 9. PATCH thiếu If-Match -> 428"
c -X PATCH $B/orders/ord_0001 -H "$J" -d '{"note":"A sua"}'

echo; echo "## 10. PATCH đúng If-Match -> 200, ETag mới"
c -X PATCH $B/orders/ord_0001 -H "$J" -H "If-Match: $ETAG" -d '{"note":"A sua"}'

echo; echo "## 11. PATCH với ETag cũ (client B) -> 412 lost update bị chặn"
c -X PATCH $B/orders/ord_0001 -H "$J" -H "If-Match: $ETAG" -d '{"note":"B sua"}'

echo; echo "## 12. Phân trang cursor: limit=1"
c "$B/orders?limit=1"
echo; echo "## 13. Trang kế (cursor lấy từ next_cursor ở trên)"
CUR=$(timeout 30 docker run --rm --network "$NET" curlimages/curl:latest -s "$B/orders?limit=1" | sed -n 's/.*"next_cursor":"\([^"]*\)".*/\1/p')
c "$B/orders?limit=1&cursor=$CUR"

echo; echo "## 14. Cursor sai -> 400"
c "$B/orders?cursor=%%%"

echo; echo "## 15. Hủy đơn (action) 2 lần: lần 2 vẫn 200 (idempotent)"
c -X POST $B/orders/ord_0002/cancel
c -X POST $B/orders/ord_0002/cancel
