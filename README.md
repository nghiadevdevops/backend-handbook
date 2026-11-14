# Lộ trình đọc

Thứ tự dưới đây suy ra từ mục "Ai nên đọc, cần biết gì" trong README của từng cuốn (cuốn nào yêu cầu đã đọc cuốn nào). Phần gom nhóm và thứ tự trong cùng một giai đoạn là gợi ý, không phải ràng buộc cứng.

## Giai đoạn 1: nền tảng
1. [system-design](books/system-design/README.md): nhiều cuốn sau đều ghi "đã nắm system design cơ bản".
2. [database-indexing](books/database-indexing/README.md): index và query plan, cần cho transaction và AI engineering.
3. [git-workflow](books/git-workflow/README.md): branching strategy (Git Flow, GitHub Flow, trunk-based), commit, pull request, release. Không cần đọc cuốn nào trước; các cuốn sdd, testing và safe-deployment dùng lại kiến thức này.

## Giai đoạn 2: dữ liệu và kiến trúc code
4. [transaction-concurrency](books/transaction-concurrency/README.md): cần đã đọc index và system design.
5. [web-architecture](books/web-architecture/README.md): tách core khỏi infrastructure, Domain Model, Repository, Ports & Adapters.
6. [sdd](books/sdd/README.md): Spec-Driven Development với AI agent. Chương 3 giải thích DDD và Hexagonal, nên đọc sau hoặc song song với cuốn 5. Phần git convention dựa trên cuốn 3.
7. [testing](books/testing/README.md): cần layered architecture, Hexagonal, DDD cơ bản và acceptance criteria dạng Given/When/Then (cuốn 5 và 6).

## Giai đoạn 3: giao tiếp giữa các thành phần
8. [api-design](books/api-design/README.md): cần HTTP cơ bản và system design.
9. [caching-redis](books/caching-redis/README.md): cần system design cơ bản.
10. [messaging-event-driven](books/messaging-event-driven/README.md): cần system design, transaction và Hexagonal/DDD (cuốn 1, 4, 5).

## Giai đoạn 4: an toàn và vận hành
11. [web-security](books/web-security/README.md): cần system design và API design (cuốn 1 và 8).
12. [safe-deployment](books/safe-deployment/README.md): không đòi hỏi cuốn nào trước, chưa cần biết Docker hay Kubernetes; có thể đọc sớm hơn nếu bạn cần đưa code lên production. Phần CI và release nối tiếp cuốn 3.
13. [observability](books/observability/README.md): cần đã học system design.

## Giai đoạn 5: ứng dụng LLM
14. [ai-engineering](books/ai-engineering/README.md): cần TypeScript/Node.js, SQL, index cơ sở dữ liệu và đã dùng AI để code (ví dụ theo cuốn sdd).

## Đọc theo mục tiêu (đường tắt)
| Mục tiêu | Đọc |
|---|---|
| Dựng backend đúng cách từ đầu | 1, 2, 3, 4, 5, 7, 8 |
| Hệ thống bất đồng bộ, event-driven | 1, 4, 5, 10 |
| Làm việc nhóm: git, review, CI và release | 3, 7, 12 |
| Đưa lên production và vận hành | 3, 12, 13, 11 |
| Làm việc với AI agent và đưa LLM vào sản phẩm | 6, 14 |
