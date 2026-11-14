# Messaging & Event-Driven Architecture

A Vietnamese study edition, written on 08/11/2026. The running example is an order system (`orders`, `outbox`, the `OrderPlaced` event).

## Who this book is for and prerequisites
Backend developers (Go/TypeScript, SQL) who have the basics of system design, transactions, and Hexagonal/DDD architecture (domain events). No prior Kafka knowledge is needed.

## Contents
1. [Chapter 1. Why we need async: queues, logs, and pub/sub](01-why-async.md)
2. [Chapter 2. Current messaging products](02-products.md)
3. [Chapter 3. Delivery semantics: at-most-once, at-least-once, "exactly-once"](03-delivery-semantics.md)
4. [Chapter 4. Ordering, partitions, consumer groups, and rebalancing](04-ordering-partitions-consumer-groups.md)
5. [Chapter 5. Retry, backoff, DLQ, poison messages, and backpressure](05-retry-dlq-backpressure.md)
6. [Chapter 6. Idempotent consumer and the inbox pattern](06-idempotent-consumer-inbox.md)
7. [Chapter 7. Transactional outbox: polling publisher and CDC](07-transactional-outbox.md)
8. [Chapter 8. Saga: choreography, orchestration, compensation](08-saga.md)
9. [Chapter 9. Event design: event types, schema, versioning, CloudEvents, schema registry](09-event-design.md)
10. [Chapter 10. Event sourcing and CQRS: when to use them, when NOT to](10-event-sourcing-cqrs.md)
11. [Chapter 11. Operations: consumer lag, monitoring, replay, running multiple versions in parallel](11-operations.md)
12. [Chapter 12. Lab: outbox, duplicate publish, inbox, retry, and DLQ](12-lab-outbox-inbox-dlq.md)

## Versions used/checked (11/2026)
| Product | Version | Verification status |
|---|---|---|
| Apache Kafka | 4.2.0 (17/02/2026) has production-ready share groups; the lab ran **4.3.1** (`kafka-topics.sh --version` = 4.3.1, image `apache/kafka:latest` at run time) | 4.3.1 actually run; 4.2 looked up via the release announcement and a roundup article |
| RabbitMQ | 4.3 line (4.3.5 per the release-information page; a third-party source says 4.3.6) | Not run; patch version not cross-checked |
| NATS Server | 2.14 (29/04/2026) | From a single third-party blog post only, not verified |
| Valkey/Redis | version not verified | Only discusses the Streams feature |
| PostgreSQL | 18 (`postgres:18-alpine`) | Actually run |
| Go (lab) | `golang:latest` = Go 1.27.3; `franz-go` v1.22.2, `pgx/v5` v5.12.0 (franz-go chosen because it is pure Go, no cgo, and maintained) | The Go consumer actually ran against Kafka and PostgreSQL |
| TypeScript (lab) | `@confluentinc/kafka-javascript` 1.11.0 (GA, based on librdkafka), `pg` 8.23.1, TypeScript 5.9.3; **KafkaJS not used** because it is no longer maintained (2.2.4, no KIP-848 support) | Only `tsc --noEmit` was run; not run against a broker (the native librdkafka build did not complete in the container) |
| CloudEvents | spec 1.0 | Stable knowledge, not re-checked |
| Debezium, Temporal, schema registry | introduced only | Not trialed; see the official docs for configuration |

## Running the labs
Requirements: Docker and a POSIX shell (Git Bash on Windows). Nothing else is installed and no ports are mapped.

```bash
cd lab && docker compose up -d && sh scripts/setup.sh
# rồi theo các lệnh trong chương 12 (consumer Go: `lab/go/`, TypeScript: `lab/ts/`); xong thì:
docker compose down -v
```

Container/network names are prefixed `bookcheck-msg-`. Real output: `lab/RESULTS.md`.

## Further reading
- Martin Kleppmann, *Designing Data-Intensive Applications* (O'Reilly, 2017), chapter 11 "Stream Processing".
- Gregor Hohpe, Bobby Woolf, *Enterprise Integration Patterns* (Addison-Wesley, 2003).
- Ben Stopford, *Designing Event-Driven Systems* (O'Reilly, 2018).
- Chris Richardson, microservices.io: the "Transactional outbox" and "Saga" patterns (https://microservices.io/patterns/).
- Official documentation: Apache Kafka (https://kafka.apache.org/documentation/, KIP-932 for share groups), RabbitMQ (https://www.rabbitmq.com/docs), Debezium Outbox Event Router (https://debezium.io/documentation/).
