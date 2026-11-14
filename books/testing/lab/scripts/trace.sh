#!/bin/sh
# Traceability AC <-> test, both directions. Plain text tools only.
set -eu
status=0

echo "Forward (AC -> test):"
for ac in $(grep -oE 'AC-ORD-[0-9]+' docs/acceptance-criteria.md | sort -u); do
  n=$(grep -rl "'$ac:" tests --include='*.test.ts' | wc -l)
  echo "$ac -> $n test file(s)"
  [ "$n" -ge 1 ] || status=1
done

echo "Backward (test -> AC):"
for ac in $(grep -rhoE "'AC-ORD-[0-9]+:" tests --include='*.test.ts' | tr -d "':" | sort -u); do
  if grep -q "$ac" docs/acceptance-criteria.md; then
    echo "$ac -> in docs"
  else
    echo "$ac -> ORPHAN (not in docs)"
    status=1
  fi
done

exit $status
