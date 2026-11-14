#!/bin/sh
# Stampede: 100 goroutines miss the same key. Usage: sh /app/run.sh <mode> <processes> [total=100]
# mode: naive | sf | lock | both. Example: sh /app/run.sh lock 5 100
set -e
MODE=${1:-naive}; P=${2:-1}; N=${3:-100}
export GOCACHE=/tmp/gocache GOMODCACHE=/tmp/gomod
[ -x /tmp/lab ] || go build -o /tmp/lab .
/tmp/lab reset
START=$(/tmp/lab startat 3000)
i=0
while [ $i -lt "$P" ]; do /tmp/lab run -mode "$MODE" -n $((N/P)) -start "$START" & i=$((i+1)); done
wait
echo "RESULT mode=$MODE processes=$P goroutines=$N real_db_queries=$(/tmp/lab count)"
