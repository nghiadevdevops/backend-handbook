#!/bin/sh
# Cache-aside repo demo, L1 demo, and XFetch vs plain TTL. Usage: sh /app/demo.sh
[ -x /tmp/lab ] || go build -o /tmp/lab .
/tmp/lab repo
/tmp/lab l1
/tmp/lab steady -mode ttl
/tmp/lab steady -mode xfetch
