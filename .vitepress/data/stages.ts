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
    title: 'Giai đoạn 1: nền tảng',
    note: 'Ba cuốn mở đầu, gần như mọi cuốn sau đều dùng lại.',
    books: [
      { id: 'system-design', title: 'System Design', desc: 'Con số cần nhớ, thành phần thường gặp, nhất quán và sẵn sàng, case study. Nhiều cuốn sau đều ghi "đã nắm system design cơ bản".' },
      { id: 'database-indexing', title: 'Database Indexing', desc: 'Index, query plan, multicolumn index, covering index và chi phí ghi. Cần cho transaction và AI engineering.' },
      { id: 'git-workflow', title: 'Git workflow', desc: 'Git Flow, GitHub Flow, trunk-based, commit, pull request, release. Không cần đọc cuốn nào trước.' }
    ]
  },
  {
    title: 'Giai đoạn 2: dữ liệu và kiến trúc code',
    note: 'Từ transaction đến cách tổ chức code và viết test.',
    books: [
      { id: 'transaction-concurrency', title: 'Transaction & Concurrency', desc: 'ACID, isolation level, MVCC, lock, deadlock và các mẫu chống race condition. Cần đã đọc index và system design.' },
      { id: 'web-architecture', title: 'Kiến trúc ứng dụng web', desc: 'Tách core khỏi infrastructure, Domain Model, Repository, Ports & Adapters.' },
      { id: 'sdd', title: 'Spec-Driven Development', desc: 'Làm việc với AI agent theo spec, qua dự án RoomBook. Nên đọc sau hoặc song song với cuốn Kiến trúc ứng dụng web.' },
      { id: 'testing', title: 'Testing', desc: 'Test bảo vệ được hành vi cho layered architecture và Hexagonal, có traceability về acceptance criteria.' }
    ]
  },
  {
    title: 'Giai đoạn 3: giao tiếp giữa các thành phần',
    note: 'API, cache và message giữa các service.',
    books: [
      { id: 'api-design', title: 'API Design', desc: 'HTTP semantics, lỗi RFC 9457, idempotency key, versioning, OpenAPI, webhook.' },
      { id: 'caching-redis', title: 'Caching với Redis/Valkey', desc: 'Pattern cache, invalidation, cache stampede, hot key, distributed lock. Cần system design cơ bản.' },
      { id: 'messaging-event-driven', title: 'Messaging & Event-driven', desc: 'Delivery semantics, outbox, inbox, saga, event sourcing. Cần system design, transaction và Hexagonal/DDD.' }
    ]
  },
  {
    title: 'Giai đoạn 4: an toàn và vận hành',
    note: 'Bảo mật, đưa code lên production và quan sát hệ thống.',
    books: [
      { id: 'web-security', title: 'Bảo mật ứng dụng web', desc: 'Injection, XSS, CSRF, authentication, OAuth/OIDC, SSRF, supply chain. Cần system design và API design.' },
      { id: 'safe-deployment', title: 'Triển khai an toàn', desc: 'Container, CI/CD, release strategy, feature flag, migration zero-downtime, Kubernetes. Có thể đọc sớm nếu cần lên production.' },
      { id: 'observability', title: 'Observability', desc: 'Metric, log, trace, OpenTelemetry, SLO, alerting, incident response. Cần đã học system design.' }
    ]
  },
  {
    title: 'Giai đoạn 5: ứng dụng LLM',
    note: 'Đưa LLM vào sản phẩm một cách có kiểm chứng.',
    books: [
      { id: 'ai-engineering', title: 'AI Engineering', desc: 'Prompt và context, tool calling, embeddings, RAG, evals, bảo mật LLM. Cần TypeScript/Node.js, SQL và index.' }
    ]
  }
]

export const allBooks: Book[] = stages.flatMap((s) => s.books)
