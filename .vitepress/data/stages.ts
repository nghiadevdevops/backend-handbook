export interface Book {
  id: string
  title: string
  desc: string
}
export interface Stage {
  title: string
  note: string
  books: Book[]
}

export const GITHUB = 'https://github.com/nghiadevdevops/backend-handbook'

export const stages: Stage[] = [
  {
    title: 'Stage 1: Foundations',
    note: 'Three opening books that almost every later book builds on.',
    books: [
      { id: 'system-design', title: 'System Design', desc: 'Numbers to know, common building blocks, consistency and availability, case studies. Most later books assume this.' },
      { id: 'database-indexing', title: 'Database Indexing', desc: 'Indexes, query plans, multicolumn and covering indexes, write costs. Needed for transactions and AI engineering.' },
      { id: 'git-workflow', title: 'Git Workflow & Branching Strategies', desc: 'Git Flow, GitHub Flow, trunk-based development, commits, pull requests, releases. No prerequisites.' }
    ]
  },
  {
    title: 'Stage 2: Data and code architecture',
    note: 'From transactions to structuring code and writing tests.',
    books: [
      { id: 'transaction-concurrency', title: 'Transactions & Concurrency', desc: 'ACID, isolation levels, MVCC, locks, deadlocks and patterns against race conditions. Read indexing and system design first.' },
      { id: 'web-architecture', title: 'Web Application Architecture', desc: 'Separating core from infrastructure, domain model, repositories, ports and adapters, with TypeScript and NestJS.' },
      { id: 'sdd', title: 'Spec-Driven Development', desc: 'Working with AI agents from specs, through the RoomBook project. Read after or alongside Web Application Architecture.' },
      { id: 'testing', title: 'Testing Layered & Hexagonal Architectures', desc: 'Tests that protect behavior across layers, with traceability back to acceptance criteria.' }
    ]
  },
  {
    title: 'Stage 3: Communication between components',
    note: 'APIs, caches and messages between services.',
    books: [
      { id: 'api-design', title: 'API Design', desc: 'HTTP semantics, RFC 9457 errors, idempotency keys, versioning, OpenAPI, webhooks.' },
      { id: 'caching-redis', title: 'Caching with Redis & Valkey', desc: 'Caching patterns, invalidation, cache stampede, hot keys, distributed locks. Needs basic system design.' },
      { id: 'messaging-event-driven', title: 'Messaging & Event-Driven Architecture', desc: 'Delivery semantics, outbox, inbox, saga, event sourcing. Needs system design, transactions and Hexagonal/DDD.' }
    ]
  },
  {
    title: 'Stage 4: Security and operations',
    note: 'Securing, shipping and observing production systems.',
    books: [
      { id: 'web-security', title: 'Web Application Security', desc: 'Injection, XSS, CSRF, authentication, OAuth/OIDC, SSRF, supply chain. Needs system design and API design.' },
      { id: 'safe-deployment', title: 'Safe Deployment', desc: 'Containers, CI/CD, release strategies, feature flags, zero-downtime migrations, Kubernetes. Can be read early.' },
      { id: 'observability', title: 'Observability & Production Operations', desc: 'Metrics, logs, traces, OpenTelemetry, SLOs, alerting, incident response. Needs system design.' }
    ]
  },
  {
    title: 'Stage 5: LLM applications',
    note: 'Bringing LLMs into products in a verifiable way.',
    books: [
      { id: 'ai-engineering', title: 'AI Engineering', desc: 'Prompts and context, tool calling, embeddings, RAG, evals, LLM security. Needs TypeScript/Node.js, SQL and indexing.' }
    ]
  }
]

export const allBooks: Book[] = stages.flatMap((s) => s.books)
