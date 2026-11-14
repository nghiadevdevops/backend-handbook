#!/usr/bin/env bash
# Lab migration PostgreSQL: chay trong Docker, khong map port, tu xoa container khi xong.
# Cach do: mot session "writer" INSERT lien tuc (moi lenh commit rieng) va ghi lai
# do tre lon nhat cua mot INSERT. Trong luc do, chay DDL o session khac.
set -u
export MSYS_NO_PATHCONV=1
C=bookcheck-deploygo-pg
DIR="$(cd "$(dirname "$0")" && pwd)"
psqlx() { docker exec -i "$C" psql -U postgres -d lab -v ON_ERROR_STOP=1 -q "$@"; }
trap 'docker rm -f "$C" >/dev/null 2>&1' EXIT

docker run -d --name "$C" -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=lab postgres:latest \
  -c max_connections=30 -c shared_buffers=64MB >/dev/null
until docker exec "$C" pg_isready -U postgres -d lab >/dev/null 2>&1; do sleep 1; done
sleep 3
psqlx -Atc "select version()"
psqlx -v rows="${ROWS:-2000000}" < "$DIR/01-seed.sql"
psqlx -Atc "CREATE TABLE probe(label text, inserts int, max_ms numeric); select 'rows=' || count(*) from orders"

writer() { # $1=nhan  $2=so giay
  psqlx -c "
DO \$\$
DECLARE t_end timestamptz := clock_timestamp() + interval '$2 seconds';
        t0 timestamptz; mx numeric := 0; n int := 0; lat numeric;
BEGIN
  WHILE clock_timestamp() < t_end LOOP
    t0 := clock_timestamp();
    INSERT INTO orders(customer_id, total) VALUES (1, 1);
    COMMIT;
    lat := extract(epoch FROM clock_timestamp() - t0) * 1000;
    n := n + 1; IF lat > mx THEN mx := lat; END IF;
    PERFORM pg_sleep(0.005);
  END LOOP;
  INSERT INTO probe VALUES ('$1', n, round(mx));
END \$\$;"
}
show_locks() {
  psqlx -c "SELECT l.mode, l.granted, left(a.query,58) AS query
            FROM pg_locks l JOIN pg_stat_activity a USING (pid)
            WHERE l.relation = 'orders'::regclass AND a.query NOT LIKE 'DO%' AND a.pid <> pg_backend_pid()
            ORDER BY l.granted DESC, l.mode"
}
scenario() { # $1=nhan $2=cau DDL
  echo; echo "=== $1 ==="
  echo "DDL: $2"
  writer "$1" 12 &
  local w=$!
  sleep 2
  psqlx -c "$2" >/dev/null &
  local d=$!
  sleep 0.7
  echo "-- pg_locks tren orders trong luc DDL chay:"
  show_locks
  wait $d; wait $w
  psqlx -Atc "select '=> ' || inserts || ' INSERT trong 12s, do tre lon nhat 1 INSERT = ' || max_ms || ' ms' from probe where label='$1'"
}

if [ "${ONLY:-}" != "EFG" ]; then
scenario "A-baseline" "SELECT pg_sleep(3)"
scenario "B-create-index-thuong" "CREATE INDEX idx_orders_customer ON orders(customer_id)"
psqlx -c "DROP INDEX idx_orders_customer"
scenario "C-create-index-concurrently" "CREATE INDEX CONCURRENTLY idx_orders_customer ON orders(customer_id)"
psqlx -Atc "select 'index valid=' || indisvalid from pg_index where indexrelid='idx_orders_customer'::regclass"
scenario "D-alter-type-bigint" "ALTER TABLE orders ALTER COLUMN total TYPE bigint"
fi

echo; echo "=== E. Expand: ADD COLUMN nullable (nhanh) + backfill theo batch ==="
psqlx -c "ALTER TABLE orders ADD COLUMN total_cents bigint"
writer_bg() { writer "E-backfill" 12 & }
writer_bg; W=$!
sleep 1
S=$(date +%s%3N)
psqlx -c "
DO \$\$
DECLARE n int;
BEGIN
  LOOP
    UPDATE orders SET total_cents = total * 100
    WHERE id IN (SELECT id FROM orders WHERE total_cents IS NULL ORDER BY id LIMIT 50000);
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
    COMMIT;
  END LOOP;
END \$\$;"
echo "  backfill xong sau $(( $(date +%s%3N) - S )) ms"
wait
psqlx -Atc "select '=> ' || inserts || ' INSERT, do tre lon nhat = ' || max_ms || ' ms' from probe where label='E-backfill'"
psqlx -Atc "select 'chua backfill (trong 12s cua writer, hang moi co NULL) = ' || count(*) from orders where total_cents is null"

echo; echo "=== F. CHECK constraint: NOT VALID roi VALIDATE ==="
psqlx -c "UPDATE orders SET total_cents = total*100 WHERE total_cents IS NULL"
psqlx -c "ALTER TABLE orders ADD CONSTRAINT chk_cents CHECK (total_cents IS NOT NULL) NOT VALID"
psqlx -c "ALTER TABLE orders VALIDATE CONSTRAINT chk_cents"
psqlx -Atc "select conname || ' validated=' || convalidated from pg_constraint where conname='chk_cents'"

echo; echo "=== G. lock_timeout: DDL tu bo thay vi xep hang chan moi nguoi ==="
docker exec -d "$C" psql -U postgres -d lab -c "BEGIN; SELECT count(*) FROM orders; SELECT pg_sleep(6);" >/dev/null
sleep 1
psqlx -c "SET lock_timeout='1s'; ALTER TABLE orders ADD COLUMN note text;" 2>&1 | head -3 || true
echo "(lenh tren bi huy do lock_timeout: dung ky vong)"
