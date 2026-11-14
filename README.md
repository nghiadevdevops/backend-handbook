# Reading Roadmap

The order below is derived from the "Who this book is for" section of each book's README (which books each one expects you to have read). The grouping and the order within a stage are suggestions, not hard requirements.

Chapters are written in Vietnamese with technical terms in English; labs use TypeScript/Node.js and Go and run entirely in Docker. Read online at **https://nghiadevdevops.github.io/backend-handbook/**.

## Stage 1: Foundations
1. [System Design](books/system-design/README.md): many later books assume you already know basic system design.
2. [Database Indexing](books/database-indexing/README.md): indexes and query plans, needed for transactions and AI engineering.
3. [Git Workflow & Branching Strategies](books/git-workflow/README.md): branching strategies (Git Flow, GitHub Flow, trunk-based), commits, pull requests, releases. No prerequisites; Spec-Driven Development, Testing and Safe Deployment build on it.

## Stage 2: Data and code architecture
4. [Transactions & Concurrency](books/transaction-concurrency/README.md): read indexing and system design first.
5. [Web Application Architecture](books/web-architecture/README.md): separating core from infrastructure, domain model, repositories, ports and adapters.
6. [Spec-Driven Development](books/sdd/README.md): working with AI agents from specs. Chapter 3 explains DDD and Hexagonal, so read it after or alongside book 5. The git conventions build on book 3.
7. [Testing Layered & Hexagonal Architectures](books/testing/README.md): needs layered architecture, Hexagonal, basic DDD and Given/When/Then acceptance criteria (books 5 and 6).

## Stage 3: Communication between components
8. [API Design](books/api-design/README.md): needs basic HTTP and system design.
9. [Caching with Redis & Valkey](books/caching-redis/README.md): needs basic system design.
10. [Messaging & Event-Driven Architecture](books/messaging-event-driven/README.md): needs system design, transactions and Hexagonal/DDD (books 1, 4, 5).

## Stage 4: Security and operations
11. [Web Application Security](books/web-security/README.md): needs system design and API design (books 1 and 8).
12. [Safe Deployment](books/safe-deployment/README.md): no prerequisites and no prior Docker or Kubernetes knowledge needed; read it earlier if you need to ship to production soon. The CI and release parts continue from book 3.
13. [Observability & Production Operations](books/observability/README.md): needs system design.

## Stage 5: LLM applications
14. [AI Engineering](books/ai-engineering/README.md): needs TypeScript/Node.js, SQL, database indexing, and some experience coding with AI (for example via book 6).

## Shortcuts by goal
| Goal | Read |
|---|---|
| Build a backend the right way from the start | 1, 2, 3, 4, 5, 7, 8 |
| Asynchronous, event-driven systems | 1, 4, 5, 10 |
| Teamwork: git, review, CI and releases | 3, 7, 12 |
| Ship to production and operate it | 3, 12, 13, 11 |
| Work with AI agents and bring LLMs into products | 6, 14 |
