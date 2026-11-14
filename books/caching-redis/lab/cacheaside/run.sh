#!/bin/sh
# Cache-aside: 200 lần đọc ngẫu nhiên trên 10 sản phẩm, rồi cập nhật giá 1 sản phẩm.
. /lab/rc.sh
psql -tAqc "TRUNCATE query_log"; rc "FLUSHALL" >/dev/null
hit=0; miss=0
get_product() {
  v=$(cget "product:$1")
  if [ -n "$v" ]; then hit=$((hit+1)); echo "$v"; return; fi
  miss=$((miss+1)); v=$(dbq "$1" aside)
  rc "SET product:$1 \"$v\" EX 60" >/dev/null; echo "$v"
}
i=0; while [ $i -lt 200 ]; do get_product $(( (i*7) % 10 + 1 )) >/dev/null; i=$((i+1)); done
echo "pha 1: hit=$hit miss=$miss  truy van DB=$(psql -tAc 'select count(*) from query_log')"
# cập nhật: ghi DB trước, rồi xóa key
psql -tAqc "UPDATE products SET price=99, updated_at=now() WHERE id=3"; rc "DEL product:3" >/dev/null
get_product 3 >/tmp/o; echo "sau update, doc lai product:3 -> $(cat /tmp/o)"
echo "pha 2: hit=$hit miss=$miss  truy van DB=$(psql -tAc 'select count(*) from query_log')"
psql -tAqc "UPDATE products SET price=8 WHERE id=3"
