# Observability & Production Operations

> A study guide written in Vietnamese and checked in practice in November 2026. Audience: backend developers who have studied system design and want to learn how to **observe** and **operate** a real system.

## Who this book is for

- You have written and deployed at least one backend service (Go, TypeScript/Node.js, Java... all fine; the main example uses Go, with a companion part for Node.js).
- You know HTTP, SQL and basic Docker; you have heard of load balancers, caches and queues.
- No prior knowledge of Prometheus or OpenTelemetry is required.

## Running example

A small ordering system made of two services: **`orders-api`** (the entry point, `GET /order`) calls **`inventory-svc`** (`GET /reserve`, which simulates a DB query, with a configurable error rate and latency). Both are written in Go 1.27 and instrumented with the OpenTelemetry Go SDK (`otelhttp`, JSON `slog` logs carrying `trace_id`). The SLO used in chapters 6, 7 and the lab is: **99.5% of requests to `orders-api` succeed over 30 days** (error budget 0.5%).

## Contents

| # | Chapter | Main content |
|---|---|---|
| 1 | [Chapter 1. Monitoring, Observability and Signals](01-monitoring-observability-signals.md) | The difference, the 4 signals (logs, metrics, traces, profiles), the state of profiling in OTel |
| 2 | [Chapter 2. OpenTelemetry](02-opentelemetry.md) | API/SDK, Collector, OTLP, semantic conventions, status per language (Go, JavaScript) |
| 3 | [Chapter 3. Metrics and Prometheus](03-metric-prometheus.md) | Counter/gauge/histogram, native histograms, cardinality, PromQL, RED/USE/Golden Signals |
| 4 | [Chapter 4. Logs](04-log.md) | Structured logging, trace IDs, levels, cost, sampling, sensitive data |
| 5 | [Chapter 5. Distributed Tracing](05-distributed-tracing.md) | Spans, W3C Trace Context, head/tail sampling, backends |
| 6 | [Chapter 6. SLIs, SLOs and Error Budgets](06-sli-slo-error-budget.md) | How to compute them, policy when the budget runs out |
| 7 | [Chapter 7. Alerting](07-alerting.md) | Symptoms instead of causes, multi-window multi-burn-rate, runbooks |
| 8 | [Chapter 8. Useful Dashboards and Useless Dashboards](08-dashboard.md) | Useful and useless dashboards |
| 9 | [Chapter 9. Incident Response Process](09-incident-response.md) | Roles, communication, blameless postmortems |
| 10 | [Chapter 10. Tracking Capacity, Performance and Continuous Profiling](10-capacity-profiling.md) | Resource tracking, forecasting, continuous profiling |
| 11 | [Chapter 11. Observability for Go and Node.js Services and Databases](11-go-nodejs-database-observability.md) | `otelhttp`, `otelpgx`/`otelsql`, OTel JS auto-instrumentation, runtime metrics, slow query log, `pg_stat_statements` |
| 12 | [Chapter 12. Lab: Building the Stack and Verifying via API](12-lab-results.md) | Building the stack, generating traffic, confirming via API, promtool |

Every chapter follows the same structure: scenario, concepts, example, trade-offs, pitfalls, summary, self-check questions (answers are at the end of the file).

## Versions

Used or checked in practice (11/2026).

| Component | Version | Notes |
|---|---|---|
| OpenTelemetry Collector (contrib) | **0.165.0** (released 2026-11-07) | Run in the lab |
| Prometheus + promtool | **v3.16.0** (2026-11-05) | Run in the lab |
| Jaeger | **2.23.0** (2026-11-05) | Run in the lab; Jaeger v2 is built on the Collector, the query API is `/api/v3/...` |
| OpenTelemetry Go SDK | **v1.47.0** (2026-10-02) | Run in the lab; `otelhttp` and `runtime` instrumentation **v0.72.0**; traces/metrics Stable, Logs API/SDK stable since v1.47.0 but the `otelslog` bridge is still v0.21.0 |
| Go | **1.27.3** (`golang:latest`) | Run in the lab; the image that runs is `distroless/static` |
| Node.js | LTS 26 (v26.13.0), 24 and 22 | Only an event-loop measuring script was run (`node:26-alpine`); `@opentelemetry/sdk-node` 0.301.0 and `auto-instrumentations-node` 0.83.0 were only read in the docs, **not run in the lab** |
| OTel Profiles signal | **Alpha** | Not for production yet; needs Collector >= 0.148.0 |
| Grafana Tempo | 3.0 line | Docs only, **not run in the lab** |
| PostgreSQL | docs for 18.x | Docs only; `pg_stat_statements` was not run in the lab |

Status can change: before applying this to a real project, reopen the pages in the further reading section.

## Running the labs

The lab lives in [`lab/`](lab/). The only requirement is Docker (with compose). The stack **maps no ports to the host**; every query goes through a `curl` container on the same network. All container and network names carry the prefix `bookcheck-obsgo-`.

```bash
cd lab
docker compose up -d --build            # jaeger, otel-collector, prometheus, inventory, orders
# Generate traffic (2 batches x 300 requests; the 2nd batch gives rate() data), then wait ~100 seconds for span_metrics to flush
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/traffic.sh 300
sleep 100
# Confirm metrics + traces reach the backends, calling the Prometheus and Jaeger APIs
docker run --rm --network bookcheck-obsgo-net -v "$PWD/scripts:/scripts:ro" curlimages/curl sh /scripts/verify.sh
# Check the alert rules
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 check rules /rules/slo-orders.yml
docker run --rm --entrypoint promtool -v "$PWD/rules:/rules:ro" prom/prometheus:v3.16.0 test rules /rules/tests/slo-orders.test.yml
# Take a trace_id from an error log, then look the trace up in Jaeger: docker logs bookcheck-obsgo-orders | grep ERROR, then sh /scripts/trace_by_id.sh <trace_id>
# Measure the Node.js event loop (not part of compose; chapter 11)
docker run --rm -v "$PWD/node:/app:ro" node:26-alpine node /app/eventloop.mjs
# Clean up
docker compose down -v
```

On Git Bash (Windows) add `MSYS_NO_PATHCONV=1` and use `$(pwd -W)` instead of `$PWD`. Each service has a `mem_limit` (about 1 GB in total). Details are in [Chapter 12](12-lab-results.md).

## Further reading

1. Charity Majors, Liz Fong-Jones, George Miranda, *Observability Engineering* (O'Reilly, 2022).
2. Betsy Beyer et al., *Site Reliability Engineering* (Google, 2016), free to read at <https://sre.google/sre-book/table-of-contents/>.
3. Betsy Beyer et al., *The Site Reliability Workbook* (Google, 2018), free at <https://sre.google/workbook/table-of-contents/>; chapter 5 "Alerting on SLOs" is the source of chapter 7.
4. OpenTelemetry docs: <https://opentelemetry.io/docs/>.
5. Prometheus docs: <https://prometheus.io/docs/>.
