# Chapter 2. Test suite shapes: pyramid, trophy, honeycomb; classical and London

## 1. Scenario

Đội A có 5 unit test và 400 E2E, CI chạy 55 phút và đỏ ngẫu nhiên. Đội B có 3.000 unit test với mock khắp nơi, CI 40 giây xanh, nhưng production vẫn hỏng vì các mảnh ghép không khớp nhau. Cả hai đều có "nhiều test" mà thiếu chiến lược: bao nhiêu test ở mỗi mức, và "unit" nghĩa là gì.

## 2. Three common shapes

```
 Pyramid (Cohn)         Trophy (Dodds)           Honeycomb (Spotify)
      /\ E2E               /\ E2E                    ___
     /  \                 /--\                     /     \  integrated: few
    /----\ Service       /    \ Integration       |  INTEGRATION  | <- many
   /      \             /------\                   \_____/
  /--------\ Unit      /  Unit  \                  impl. detail: few
 /__________\          \ Static /
```

- **Test pyramid** (Mike Cohn; Fowler giải thích trong bài "TestPyramid"): nhiều unit test ở đáy (nhanh, rẻ), ít UI test/E2E ở đỉnh (chậm, brittle). Dễ hiểu, nhưng không nói "unit" lớn cỡ nào.
- **Testing trophy** (Kent C. Dodds, hướng frontend): nhấn mạnh integration test ở giữa, có thêm static analysis ở đáy.
- **Honeycomb** (Spotify, cho microservice): phần lớn là integration test của từng service, ít test implementation detail, ít integration test toàn hệ thống.

Điểm chung: **càng lên cao càng ít, vì càng chậm và brittle; nhưng không có tỉ lệ vàng**. Hình dạng nên là kết quả của kiến trúc. Với Hexagonal, kiến trúc gợi ý một hình rất cụ thể (xem mục 5).

## 3. What a "unit" is: two schools

Khorikov và Fowler mô tả hai cách hiểu.

| | Classical (Detroit/Chicago) | London (mockist) |
|---|---|---|
| "Unit" là | một **hành vi**, có thể gồm nhiều class phối hợp | **một class**, cô lập khỏi mọi dependency |
| Isolation | các **test** cô lập với nhau (không chia sẻ state) | **class** cô lập khỏi collaborator |
| Dependency | dùng object thật; double chỉ cho dependency *out-of-process, shared* | mock gần như mọi collaborator thay đổi được |
| Điểm yếu | khi đỏ, khó chỉ ngay class nào hỏng | test gắn với cách các class gọi nhau, brittle khi refactor |

Phân biệt này chính là chủ đề của bài "Mocks Aren't Stubs" của Martin Fowler (classical = state verification, mockist = behavior verification).

Quan điểm của sách này (cũng là của Khorikov): **thiên về classical**. Lý do: test classical nhắm vào hành vi, nên chịu refactor tốt (trụ 2, chương 1). Mock chỉ dành cho dependency không quản lý được và nằm ngoài system boundary (chương 4).

Ví dụ trong lab: `Order` dùng `OrderLine` và `Money` thật, không mock. `OrderTest` coi `Order + OrderLine + Money` là một "unit hành vi".

## 4. Characteristics by speed and scope

| Loại | Chạm | Tốc độ | Ví dụ trong lab |
|---|---|---|---|
| Unit | bộ nhớ, domain | ms | `tests/unit/order.test.ts` |
| Use case + fake | bộ nhớ, nhiều layer | ms | `tests/application/` |
| Integration | DB thật, file, queue | trăm ms | `tests/integration/postgres-order-repository.test.ts` |
| HTTP (`app.inject`) | framework in-process | trăm ms - giây | chương 7 |
| E2E | trình duyệt + toàn hệ thống | giây - phút | chương 12 |

Trong lab, 74 test chạy trong vài giây tổng cộng (Vitest báo 11 giây trên máy đang bận, 4 giây khi máy rảnh cho cả bộ, gồm cả integration với PostgreSQL thật và Pact).

## 5. What shape Hexagonal gives us

```
        [HTTP / CLI / queue consumer]    <- HTTP test (chương 7), vài cái
                  |
           +--------------+
           | Application  |  <- test use case với fake (chương 5), nhiều
           +--------------+
           |    Domain    |  <- unit test thuần (chương 3), nhiều nhất
           +--------------+
        port /          \ port
   [Postgres adapter] [Payment adapter]   <- integration test (chương 6), mỗi adapter vài chục
```

- **Domain**: nhiều logic, ít dependency: viết nhiều unit test, rất nhanh, giá trị cao.
- **Application**: ít logic, chủ yếu orchestration: test bằng fake, kiểm tra kết quả cuối.
- **Adapter**: nhiều "keo" với infrastructure: unit test vô nghĩa, cần integration test với infrastructure thật.
- **Controller/HTTP boundary**: mỏng. Vài HTTP test kiểm tra routing, validation, status code, định dạng JSON.

Khorikov gọi nhóm code theo hai trục (độ phức tạp, số dependency): code **domain** (phức tạp, ít dependency) cần unit test dày; **controller** (đơn giản, nhiều dependency) cần integration test mỏng; code **quá phức tạp và quá nhiều dependency** nên tách ra (Humble Object).

## 6. Trade-offs: which shape to pick when

- Nghiệp vụ dày, ít I/O: nghiêng pyramid (nhiều unit domain).
- Dịch vụ CRUD mỏng, logic chủ yếu ở SQL/ORM: nghiêng honeycomb/trophy (integration là chính, unit domain ít giá trị).
- Nhiều service nói chuyện với nhau: thêm contract test (chương 9) thay vì E2E toàn bộ.

KHÔNG nên: áp tỉ lệ cứng "70/20/10". Hãy hỏi "lỗi loại nào hay lọt vào production, và layer nào rẻ nhất để bắt nó?"

## 7. Pitfalls

- **Ice-cream cone**: ngược pyramid (nhiều E2E/test tay, ít unit).
- **Mock mọi collaborator trong domain**: test chỉ lặp lại cấu trúc implementation.
- **Gọi mọi thứ là "unit test"** nhưng thực chất chạm DB, làm bộ test chậm dần mà không ai để ý.
- Coi hình pyramid là luật thay vì là heuristic.

## 8. Summary

- Pyramid, trophy, honeycomb đều nói: càng lên cao càng ít vì chậm và brittle; tỉ lệ cụ thể tùy kiến trúc.
- Classical coi "unit" là một hành vi; London coi là một class cô lập bằng mock. Sách này theo classical.
- Hexagonal tự nhiên cho: nhiều unit ở domain, test use case với fake, integration cho adapter, ít HTTP/E2E.
- Chọn loại test theo loại lỗi muốn bắt và chi phí để bắt.

## 9. Self-check questions

1. Khác biệt cốt lõi giữa classical và London là gì?
2. Vì sao với `PostgresOrderRepository` unit test (mock `pg`) gần như vô nghĩa?
3. Một service CRUD mỏng, ít business rule: hình nào hợp hơn, pyramid hay honeycomb?
4. Test pyramid không nói rõ điều gì mà dễ gây hiểu lầm?

<details><summary>Answer</summary>

1. Classical coi unit là hành vi, dùng object thật và chỉ double dependency bên ngoài; London coi unit là một class và mock collaborator.
2. Mock `pg` chỉ kiểm tra rằng ta gửi chuỗi SQL đã viết, không kiểm tra SQL có chạy đúng trên PostgreSQL, constraint, data type. Rủi ro nằm ở sự tương tác với DB thật.
3. Honeycomb (nghiêng integration), vì ít logic domain để unit test; lỗi nằm ở tích hợp với DB/framework.
4. "Unit" lớn cỡ nào (một class hay một hành vi), nên mỗi đội hiểu một kiểu.
</details>
