#!/bin/sh
# Xac nhan BANG API (tu mot container khac) rang metric va trace da toi backend.
# Jaeger v2 dung API v3 (/api/v3/...); /api/services cua Jaeger v1 khong con.
P=http://prometheus:9090
J=http://jaeger:16686
q() { curl -s -m 20 -G "$P/api/v1/query" --data-urlencode "query=$1"; echo; }
S=$(date -u -d @$(( $(date +%s) - 3600 )) +%Y-%m-%dT%H:%M:%SZ)
E=$(date -u -d @$(( $(date +%s) + 60 )) +%Y-%m-%dT%H:%M:%SZ)
jq_traces() { curl -s -m 20 -G "$J/api/v3/traces" --data-urlencode "query.service_name=orders-api" \
  --data-urlencode "query.start_time_min=$S" --data-urlencode "query.start_time_max=$E" "$@"; }

echo "== 1. Prometheus targets (up) =="
q 'up'

echo "== 2. RED tu spanmetrics: so request orders-api theo status =="
q 'sum by (status_code) (traces_span_metrics_calls_total{service_name="orders-api",span_kind="SPAN_KIND_SERVER"})'

echo "== 3. Metric custom tu Go SDK (cumulative): orders_processed_total =="
q 'sum by (outcome) (orders_processed_total)'

echo "== 4. Latency p95 orders-api (histogram_quantile) =="
q 'histogram_quantile(0.95, sum by (le) (rate(traces_span_metrics_duration_milliseconds_bucket{service_name="orders-api",span_kind="SPAN_KIND_SERVER"}[5m])))'

echo "== 5. Recording rule ti le loi 5m =="
q 'service:orders_error_ratio:rate5m'

echo "== 6. Jaeger: danh sach service =="
curl -s -m 20 "$J/api/v3/services"; echo

echo "== 7. Jaeger: 1 trace cua orders-api =="
jq_traces --data-urlencode "query.num_traces=1" > /tmp/trace.json
echo "service trong trace:"; grep -o '"key":"service.name","value":{"stringValue":"[^"]*"' /tmp/trace.json | sort -u
echo "ten span:"; grep -o '"name":"[^"]*","kind":[0-9]' /tmp/trace.json | sort | uniq -c
echo "traceId: $(grep -o '"traceId":"[0-9a-f]*"' /tmp/trace.json | sort -u | head -1)"

echo "== 8. Jaeger: trace co span http.response.status_code=502 =="
jq_traces --data-urlencode "query.num_traces=3" \
  --data-urlencode 'query.attributes={"http.response.status_code":"502"}' | grep -o '"traceId":"[0-9a-f]*"' | sort -u

echo "== 9. Alert dang pending/firing (Prometheus) =="
curl -s -m 20 "$P/api/v1/alerts"; echo

echo "== 10. Go runtime metrics (go.goroutine.count) + otelhttp server duration =="
q 'go_goroutine_count'
q 'sum by (service_name) (http_server_request_duration_seconds_count)'

echo "== 11. pprof: goroutine dump cua orders (cong 6060, noi bo network) =="
curl -s -m 20 "http://orders:6060/debug/pprof/goroutine?debug=1" | head -1
