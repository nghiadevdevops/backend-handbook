# Chương 11. Mutation testing (StrykerJS) và property-based testing (fast-check)

## 1. Tình huống

Bộ test có coverage 100% cho `Order`, mọi test xanh. Bạn xóa dòng `this.#assertStatus('draft', ...)` khỏi `place()`. Test vẫn xanh. Coverage nói dòng đó "được chạy", nhưng không test nào kiểm tra hậu quả khi nó biến mất. Mutation testing trả lời câu hỏi thật sự: **nếu code sai, test có phát hiện không?**

## 2. Mutation testing hoạt động thế nào

```
 code gốc --(sinh biến thể nhỏ có lỗi: đổi >= thành >, xóa lời gọi, ...)--> mutant
 chạy test trên từng mutant:
    test ĐỎ  -> mutant KILLED (tốt: test phát hiện lỗi)
    test XANH -> mutant SURVIVED (xấu: test không bảo vệ chỗ đó)
 MSI (Mutation Score Indicator) = killed mutant / tổng mutant
```

StrykerJS (`@stryker-mutator/core` 10.1.1) tạo mutant bằng các mutator (đổi operator, đổi điều kiện thành `true`/`false`, rỗng hóa block, xóa chuỗi, bỏ lời gọi hàm...). Nó chạy bộ test cho mỗi mutant và dùng `coverageAnalysis: "perTest"` để chỉ chạy các test có chạm tới dòng bị đổi. Hai plugin dùng trong lab: `@stryker-mutator/vitest-runner` (chạy mutant qua Vitest) và `@stryker-mutator/typescript-checker` (loại các mutant không compile).

Về trạng thái "Timeout" của Stryker: mutant làm test treo (ví dụ vòng lặp vô hạn) cũng được tính là đã phát hiện, giống killed. Về "CompileError": mutant mà TypeScript từ chối biên dịch (ví dụ rỗng hóa thân hàm có kiểu trả về) không được chạy và **không** tính vào MSI. Đây là điểm đặc thù TypeScript: type system "kill" một phần mutant trước khi test chạy.

## 3. Chạy trong lab

Cấu hình `lab/stryker.config.json`:

```json
{
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.mutation.config.ts" },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": ["src/domain/**/*.ts", "src/application/**/*.ts"],
  "coverageAnalysis": "perTest",
  "reporters": ["clear-text", "json"],
  "thresholds": { "high": 90, "low": 80, "break": 80 },
  "concurrency": 4
}
```

`vitest.mutation.config.ts` chỉ gom các suite nhanh (unit, application, acceptance, characterization, schema test), bỏ integration (cần PostgreSQL), Pact và HTTP, để mỗi mutant chạy trong vài chục ms. Lệnh:

```
$ ./run.sh mutation      # = npx stryker run, trong container node:26
```

**Lưu ý phiên bản TypeScript.** TypeScript 7.0.2 (bản Go native) đã ra, và `tsc --noEmit` của nó chạy sạch trên lab (đã thử). Nhưng `@stryker-mutator/core` 10.1.1 gọi API JavaScript của compiler (`ts.parseConfigFileTextToJson`) mà gói `typescript` 7 không còn cung cấp, nên Stryker dừng ngay với `TypeError: ts.parseConfigFileTextToJson is not a function`. Lab vì vậy ghim `typescript` ở 6.0.3 (bản 6 cuối cùng còn API cũ). Nếu bạn dùng TypeScript 7, chạy `tsc` bằng bản 7 nhưng cần theo dõi khi nào Stryker hỗ trợ.

### Vòng 1: bộ test ban đầu và fake giữ reference

```
140 mutants: 41 CompileError, 99 tested
   82 Killed, 0 Timeout, 14 Survived, 3 NoCoverage
Mutation score 82.83 (total), 85.42 (covered)
```

17 mutant còn lại (14 survived + 3 no coverage), nhìn từng nhóm:

| # | Vị trí | Mutator | Ý nghĩa |
|---|---|---|---|
| 1 | `money.ts:23, 38` | CallExpression | bỏ `this.assertSameCurrency(other)` trong `add` và `isAtLeast` |
| 2 | `money.ts:47-49` | BlockStatement, ConditionalExpression, StringLiteral | cả thân `assertSameCurrency` bị rỗng hóa hoặc `if (false)`; hai mutant không có test nào chạy tới (NoCoverage) |
| 3 | `money.ts:44` | ConditionalExpression | `equals` bỏ so sánh `currency` |
| 4 | `order.ts:40, 48, 57` | StringLiteral | thông báo lỗi `'Chi them dong...'`, `'Chi dat duoc...'`, `'Chi thanh toan...'` thành chuỗi rỗng |
| 5 | `money.ts:8`, `order-line.ts:11`, `pay-order.ts:18` | StringLiteral | thông báo lỗi khác thành rỗng |
| 6 | `order-not-found.ts:2, 5`, `domain-error.ts:3` | StringLiteral | `name` và message của error class |
| 7 | `order.ts:34` | ArrayDeclaration (NoCoverage) | `order.#lines = [...lines]` thành `[]` trong `reconstitute`: không test nào chạy qua (fake lúc này lưu reference nên không gọi `reconstitute`) |

Phân tích và cách xử lý:

1-3. **Không có test cho tiền tệ khác nhau.** Giống bản gốc: branch này không thể đạt được qua `Money.vnd`, nên hoặc xóa kiểm tra (dead code) hoặc biến tiền tệ thành khái niệm thật. Lab chọn cái sau: có `Money.of(amount, currency)` và thêm test `cannot add different currencies`, `cannot compare different currencies`, và một ca `equals` khác tiền tệ.
4-5. **Thông báo lỗi chưa được pin.** Test chỉ kiểm tra `toThrow(DomainError)` nên đổi message thành rỗng vẫn xanh. Ở đây thông báo là hành vi hiển thị (HTTP trả về nó, chương 7), nên pin lại bằng `toThrow('Chi dat duoc don dang nhap')` và tương tự. Đồng thời thêm test `cannot place an order twice`: bản đầu **chưa có** test cho quy tắc "chỉ đặt được đơn nháp", nhưng Stryker không báo lỗ hổng này (xem đoạn dưới), mình thêm vì nó là quy tắc nghiệp vụ.
6. **`name` của error class**: thêm `tests/unit/errors.test.ts`; `name` xuất hiện trong log và trong lỗi, nên coi là observable.
7. Tự hết khi fake dùng `Order.reconstitute` (xem dưới).

**Chuyện "quên `save()`" ở bản TypeScript.** Ở bản PHP, Infection sinh mutant bỏ lời gọi `$this->orders->save($order)` và cho thấy nó survived vì fake lưu reference. Ở bản này Stryker **không sinh** mutant tương tự: mutator `CallExpression` bỏ `order.markPaid();` (mutant này bị kill, vì đơn không thành `paid`) nhưng không đụng tới câu lệnh `await this.#orders.save(order);`, tức là các lời gọi nằm sau `await` không bị xóa. (Đây là quan sát từ báo cáo JSON của lần chạy: `pay-order.ts` có mutant ở dòng 14, 17, 17, 17, 17, 18, 21; không có mutant nào ở dòng 22 là dòng `save`.) Tương tự, Stryker không sinh mutant bỏ lời gọi `this.#assertStatus(...)` (gọi qua private method `#`): ở `order.ts:40, 48, 57` chỉ có mutant của chuỗi thông báo, không có mutant "bỏ lời gọi" như `assertStatus` bản PHP. Vì vậy lỗ hổng "đặt đơn hai lần" mà Infection từng báo ở bản PHP, Stryker không báo ở bản này. Nghĩa là lỗi "fake giữ reference" sẽ **không** được mutation testing tự động tìm ra cho đoạn code async. Ta tái hiện bằng tay (chương 5): comment dòng `save`, chạy test với fake giữ reference thì 12 test xanh; đổi fake sang lưu bản copy thì 3 test đỏ. Bài học tổng quát: mutation testing không thay thế việc review test double.

### Vòng 2: sau khi thêm/sửa test và sửa fake

```
140 mutants: 41 CompileError, 99 tested
   99 Killed, 0 Timeout, 0 Survived, 0 NoCoverage
Mutation score 100.00
```

Ở một lần chạy trước đó (cùng code, máy đang bận hơn) ba mutant ở `money.ts:7` (`if (!Number.isSafeInteger(amount) || amount < 0)` bị đổi thành `false` hoặc `&&`) được báo là `Timeout` thay vì `Killed`; Stryker tính timeout là đã phát hiện nên MSI vẫn 100%, nhưng phân loại killed/timeout phụ thuộc tải máy, đừng so sánh hai con số này giữa các lần chạy. Phân bố theo file (lần chạy cuối): `order.ts` 40 killed, `money.ts` 34, `order-line.ts` 9, `pay-order.ts` 7, `place-order.ts` 4, `cancel-order.ts` 2, `order-not-found.ts` 2, `domain-error.ts` 1; `order-presenter.ts` có 4 mutant và cả 4 là CompileError (type của giá trị trả về đã loại chúng). Toàn bộ test của lab (kể cả integration, Pact, HTTP): xem mục "Kết quả chạy thực tế" ở README.

Thời gian chạy: vòng 1 mất 6 phút 6 giây (concurrency 2); lần chạy cuối của vòng 2 mất 12 phút 43 giây (`concurrency: 4`, Stryker chia thành 2 checker process và 2 test runner process), trên máy đang chạy song song nhiều việc khác nên số này không phản ánh hiệu năng thật. Phần lớn thời gian là TypeScript checker, không phải test (trung bình 1,74 test chạy cho mỗi mutant).

## 4. Đọc kết quả đúng cách

- **Mutant survived không phải lúc nào cũng cần kill.** Có "equivalent mutant" (đổi mà hành vi không đổi) và mutant vô hại (thông báo log). Đánh giá từng cái, đừng tôn sùng 100%. Lab chọn pin thông báo lỗi vì chúng là hành vi hiển thị; nếu thông báo chỉ để debug, dùng chú thích `// Stryker disable next-line StringLiteral` thay vì viết test vô nghĩa.
- **MSI thấp ở domain = ưu tiên viết test.** MSI ở code keo/adapter ít ý nghĩa.
- Chạy mutation trên **phần thay đổi** trong CI (Stryker có `--incremental`, lưu kết quả trước đó vào file và chỉ chạy lại mutant bị ảnh hưởng) để nhanh; chạy toàn bộ theo lịch (nightly).
- Nếu có TypeScript, bật `typescript-checker`: không có nó, mutant không compile vẫn chạy và có thể bị tính là survived oan (vì Vitest/esbuild bỏ qua kiểu), kéo MSI xuống giả tạo.

## 5. Property-based testing với fast-check

Test theo ví dụ kiểm tra vài điểm bạn nghĩ ra. **Property-based testing** kiểm tra một *property luôn đúng* (tính chất bất biến theo mọi đầu vào) với hàng trăm input sinh ngẫu nhiên, và **shrink** (thu nhỏ) ca thất bại về ca đơn giản hơn. Thư viện: **fast-check** 4.10.2 (tích hợp được với mọi test runner; lab dùng với Vitest).

`lab/tests/unit/money.property.test.ts`, seed cố định để tái hiện được:

```ts
const config: fc.Parameters<unknown> = { seed: 20261107, numRuns: 200 };

/** Runs the property and turns a failure into a normal assertion that prints seed + shrunk counterexample. */
function holds<T extends unknown[]>(property: fc.IPropertyWithHooks<T>): void {
  const result = fc.check(property, config);

  expect(result.failed, fc.defaultReportMessage(result)).toBe(false);
}

const money = fc.integer({ min: 0, max: 5_000_000 }).map((n) => Money.vnd(n));

it('addition is commutative, associative and has 0 as identity', () => {
  holds(
    fc.property(money, money, money, (a, b, c) => {
      return (
        a.add(b).equals(b.add(a)) &&
        a.add(b).add(c).equals(a.add(b.add(c))) &&
        a.add(Money.vnd(0)).equals(a)
      );
    }),
  );
});

it('discount never increases and never goes negative', () => {
  holds(
    fc.property(money, fc.integer({ min: 0, max: 100 }), (m, percent) => {
      const discounted = m.discountPercent(percent);

      return discounted.amount <= m.amount && discounted.amount >= 0;
    }),
  );
});
```

Mỗi property chạy 200 lần (`numRuns`). Bộ ba property của lab: cộng giao hoán, kết hợp và có phần tử đơn vị; giảm giá không tăng và không âm; `multiply` bằng cộng lặp.

**Một bài học nhỏ nhưng thật:** lần đầu viết bằng `fc.assert(...)` (cách trong docs), test xanh. Khi bật `expect.requireAssertions: true` (chương 1) cả ba test property **đỏ** với `expected any number of assertion, but got none`, vì `fc.assert` tự ném lỗi chứ không gọi `expect`. Hàm `holds` ở trên dùng `fc.check` rồi `expect(result.failed, fc.defaultReportMessage(result)).toBe(false)`: vừa thỏa quy tắc "mỗi test có assertion", vừa giữ thông báo lỗi đầy đủ (seed, đường dẫn, counterexample đã shrink).

**Xem một property thất bại trông thế nào.** Ta cố ý viết sai property "giảm 10% đúng bằng 0,9 lần số tiền" (sai khi số tiền không chia hết cho 10, vì code làm tròn xuống):

```
AssertionError: Property failed after 1 tests
{ seed: 20261107, path: "0:1:0:0:0:1:0:0:0:0:0:0:0:0:0:0:0:2:0:0:0", endOnFailure: true }
Counterexample: [156281]
Shrunk 20 time(s)
```

Thông báo cho đủ để tái hiện: cùng `seed` và `path` cho đúng ca đó. Shrinking đã đưa counterexample về `156281`; nó không nhất thiết là ca nhỏ nhất (ở đây `1` cũng là counterexample), vì shrinker đi theo một đường tìm kiếm chứ không đảm bảo cực tiểu. Test này chỉ để minh họa, không nằm trong lab.

Property hay dùng cho domain: commutative/associative, idempotent (áp hai lần như một lần), round trip (`JSON.stringify` rồi `JSON.parse` ra bản gốc), invariant (tổng tiền không âm), "reference model" (so với implementation chậm nhưng hiển nhiên đúng). fast-check còn có `fc.record`, `fc.array`, `fc.constantFrom` để sinh cả `Order` hợp lệ, và model-based testing (`fc.commands`) cho chuỗi lệnh trên một object có state.

## 6. Trade-off

| | Mutation testing | Property-based |
|---|---|---|
| Trả lời | test có bắt được lỗi không | property có luôn đúng không |
| Chi phí | chậm (chạy test nhiều lần, thêm TypeScript checker) | nhanh; khó nghĩ ra property tốt |
| Hợp với | domain, code có logic | pure function, value object, parser |

KHÔNG nên: chạy mutation cho cả repo mỗi commit; đặt MSI bắt buộc 100% (dẫn tới test vô nghĩa chỉ để kill equivalent mutant); property test cho code đầy I/O.

## 7. Cạm bẫy

- Chạy Stryker với test chậm (integration) → hàng giờ. Giới hạn `mutate` ở domain/application và dùng config Vitest riêng chỉ có test nhanh.
- Seed ngẫu nhiên không cố định → test đỏ không tái hiện được. Luôn in/ghi seed (fast-check in sẵn khi fail).
- Property trùng lặp logic code (tính lại công thức) → vô nghĩa.
- Hiểu nhầm MSI là chỉ số chất lượng duy nhất; và quên rằng mutator có điểm mù (như lời gọi sau `await` ở trên).
- Dùng `timeout` mặc định của công cụ quá ngắn trong CI: lab phải nâng timeout của lệnh `docker run` lên 25 phút cho Stryker.

## 8. Tóm tắt

- Mutation testing đo khả năng *phát hiện lỗi* của test, thứ coverage không đo.
- Lab: vòng 1 có 17/99 mutant còn lại (14 survived + 3 no coverage, MSI 82,83%), vòng 2 kill hết (MSI 100%, 99/99 mutant bị kill) sau khi thêm test, pin thông báo lỗi và sửa fake.
- Mutant survived cần được phân tích: lỗ hổng test, dead code, hay mutant vô hại. Mutation testing cũng có điểm mù; đừng bỏ review test double.
- Property-based test (fast-check) kiểm tra property trên nhiều input sinh ngẫu nhiên; luôn cố định seed và nhớ rằng runner có thể yêu cầu phải có `expect`.
- StrykerJS 10.1.1 chưa chạy được với TypeScript 7 (API compiler cũ): lab ghim TypeScript 6.0.3.

## 9. Câu hỏi tự kiểm tra

1. Vì sao coverage 100% vẫn có mutant survived?
2. Vì sao Stryker không tìm ra lỗi "fake giữ reference" trong lab, và ta làm gì thay thế?
3. MSI 100% có nghĩa test hoàn hảo không?
4. Nêu hai property cho `Money.add`.
5. `CompileError` khác `Survived` ở điểm nào?

<details><summary>Đáp án</summary>

1. Coverage chỉ cho biết dòng được chạy, không biết kết quả có được kiểm tra; mutant thay đổi hành vi mà test không assert thì survived.
2. Stryker không sinh mutant xóa lời gọi nằm sau `await` (`await this.#orders.save(order)`). Ta tái hiện bằng tay: bỏ dòng `save`, chạy với fake giữ reference (xanh) và với fake lưu bản copy (đỏ).
3. Không: nó chỉ nói test kill được các mutant mà Stryker sinh ra, không bao phủ mọi loại lỗi hay yêu cầu bị bỏ sót.
4. Commutative `a+b = b+a`; associative `(a+b)+c = a+(b+c)`; identity element `a+0 = a`.
5. `CompileError` là mutant TypeScript từ chối biên dịch, không chạy test và không tính vào MSI; `Survived` là mutant biên dịch được, test chạy xong vẫn xanh.
</details>
