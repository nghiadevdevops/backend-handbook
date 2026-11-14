#!/bin/sh
# Chay trong container curl, cung network voi stack.  Dung: sh traffic.sh [so_request]
N="${1:-400}"
i=0; ok=0; bad=0
while [ "$i" -lt "$N" ]; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://orders:8080/order)
  if [ "$code" = "200" ]; then ok=$((ok+1)); else bad=$((bad+1)); fi
  i=$((i+1))
done
echo "requests=$N ok=$ok error=$bad"
