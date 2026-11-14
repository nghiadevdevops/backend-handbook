#!/bin/sh
# Kiểm tra mỗi AC-<uc>-<n> trong specs/use-cases/ có ít nhất một test tên test_ac_<uc>_<n>_...
# (dạng test("test_ac_001_1_...") trong tests/acceptance/*.test.ts). Chỉ cần sh + grep.
# Chạy trong container (busybox/alpine là đủ). Thoát mã 1 nếu thiếu.
cd "$(dirname "$0")/.." || exit 2
missing=0
for ac in $(grep -ho 'AC-[0-9][0-9]*-[0-9][0-9]*' specs/use-cases/*.md | sort -u); do
  key=$(echo "$ac" | tr 'A-Z-' 'a-z_')   # AC-001-1 -> ac_001_1
  if grep -rqE "test\(.test_${key}_" tests/; then
    echo "OK      $ac"
  else
    echo "MISSING $ac"
    missing=$((missing + 1))
  fi
done
[ "$missing" -eq 0 ] && echo "Tất cả AC đều có test." || { echo "$missing AC thiếu test."; exit 1; }
