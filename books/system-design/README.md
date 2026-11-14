# System Design

**Last updated: 2026-11-07.** A self-study edition based on the outline of the ebook "System Design" (author: Huy), rewritten in new wording, with known errors corrected and updated to current conditions (SLAs, products, protocol standards). The lecture text of the chapters is written in Vietnamese.

## Contents

1. [The System Design Interview: Purpose and Answer Framework](01-system-design-interview.md)
2. [Foundational Concepts and Numbers to Know](02-fundamentals-and-numbers.md) (the "nines" table, MTBF/MTTR, SLA vs. design availability, latency table, estimation)
3. [Common System Components](03-common-components.md)
4. [Consistency and Availability: Replication, Quorum, CAP, PACELC](04-consistency-and-availability.md)
5. [Databases: Choosing a Type, Sharding, Indexes, Transactions, Locking](05-databases.md)
6. [Scaling and Performance: Load Balancer and Caching](06-load-balancing-and-caching.md)
7. [Message Queues, Delivery Semantics and Idempotency](07-message-queues-delivery-semantics.md) (outbox, idempotent consumer)
8. [Communication and API Design: HTTP, TCP, UDP, QUIC, RPC, REST](08-protocols-and-api-design.md) (TCP/UDP/QUIC, REST, status codes, idempotent methods)
9. [Fault Tolerance and Recovery: Retry, Circuit Breaker, Rate Limiting, HA](09-fault-tolerance-and-recovery.md) (retry + backoff + jitter, circuit breaker, rate limiting, HA)
10. [Security and Authorization](10-security-and-authorization.md)
11. [Monitoring and Observability (with OpenTelemetry)](11-monitoring-and-observability.md)
12. [Three Worked Designs, End to End](12-design-case-studies.md) (URL shortener, news feed, chat)

## How to read

- **First pass**: read 1 → 2 → 3, then 4 → 5 (the most theory-heavy), then 6 → 11 as needed, and finish with chapter 12.
- **Last-minute interview review**: chapter 1 (the framework), the "What to say in an interview" and "Summary" sections of each chapter, the number tables in chapter 2, then redo one design from chapter 12 on paper.
- Each chapter follows the same structure: explanation → design example → trade-offs → what to say in an interview → pitfalls → summary → self-check questions (answers in a `<details>` block at the end of the file; try answering before opening it).
- Diagrams use Mermaid; they render in GitHub, VS Code (with an extension), and Obsidian.
- The numbers in the design exercises are **assumptions**; the calculations are shown so you can check them.

## A note on how fresh the information is

SLAs, product versions, and licenses change quickly. The figures and statuses in this book were checked on 2026-11-07 (sources are listed at the end of each chapter). Before quoting them in anything important, check the official pages again.
