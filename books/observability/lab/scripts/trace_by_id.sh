#!/bin/sh
# Dung: sh trace_by_id.sh <trace_id>  -- lay mot trace theo ID tu Jaeger v2 (API v3) de doi chieu voi log.
curl -s -m 20 "http://jaeger:16686/api/v3/traces/$1" > /tmp/t.json
echo "service:"; grep -o '"key":"service.name","value":{"stringValue":"[^"]*"' /tmp/t.json | sort -u
echo "span:"; grep -o '"name":"[^"]*","kind":[0-9]' /tmp/t.json
