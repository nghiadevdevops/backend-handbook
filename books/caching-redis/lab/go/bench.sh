#!/bin/sh
# Run every stampede scenario 3 times. Usage: sh /app/bench.sh
for round in 1 2 3; do
  for sc in "naive 1" "sf 1" "naive 5" "sf 5" "lock 5" "both 5"; do
    set -- $sc
    sh /app/run.sh "$1" "$2" 100 2>&1 | grep -v '^proc'
  done
done
