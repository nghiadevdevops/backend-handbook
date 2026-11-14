# Chapter 12. E2E (Playwright Test), flaky tests, test data, and CI

> **Trạng thái kiểm chứng:** hai test Playwright (mục 3) đã chạy thật trong image chính thức `mcr.microsoft.com/playwright:v1.65.0-noble` với `@playwright/test` 1.65.0: `2 passed (15.1s)`. Lần đầu chạy phải kéo image nhiều GB nên mất rất lâu; phần chạy test thật chỉ vài chục giây. Phần builder (mục 5) là code thật, đã chạy trong lab. Workflow CI (mục 7) **chưa chạy thử** (cần GitHub Actions); đối chiếu tài liệu GitHub Actions.

## 1. Scenario

Pipeline đỏ lúc 3 giờ sáng, chạy lại thì xanh. Cả đội bắt đầu bấm "re-run" mà không đọc lỗi. Một tuần sau, một bug thật bị bỏ qua vì mọi người nghĩ "lại flaky". Flaky test (test không ổn định) giết dần niềm tin vào cả bộ test, tệ hơn không có test.

## 2. E2E: the smallest tip of the suite

E2E đi qua toàn hệ thống như người dùng thật (trình duyệt, HTTP, DB thật). Giá trị: bắt lỗi tích hợp mà mọi test dưới không thấy. Giá: chậm, brittle, khó gỡ lỗi. Vì vậy chỉ giữ một số ít **critical user journey** (đăng nhập, đặt hàng, thanh toán), không dùng E2E để kiểm tra từng business rule (đã có ở các layer dưới).

## 3. Playwright Test (run)

Playwright (`@playwright/test` 1.65.0) có test runner riêng (không dùng Vitest), tự động chờ element (auto-wait), và locator theo role. Lab có một trang giỏ hàng tí hon (`lab/src/http/cart-page.ts`, phục vụ ở `GET /`) để có UI thật cho journey đặt hàng. Test (`lab/tests/e2e/place-order.spec.ts`):

```ts
import { expect, test } from '@playwright/test';

// Critical user journey: customer places an order from the cart page.
// Business rules (the 10% discount) are NOT re-tested in detail: one number proves the wiring.
test('customer places an order from the cart', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Gio hang' })).toBeVisible();
  await page.getByRole('button', { name: 'Dat hang' }).click();

  await expect(page.getByRole('status')).toContainText(/Da dat web-\d+ - tong 1080000 VND/);
});

test('the page shows an error when the API rejects the request', async ({ page }) => {
  // Network-level stub of the API: simulate a domain error without touching the server state.
  await page.route('**/orders', (route) =>
    route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Don toi da 5 dong"}' }),
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Dat hang' }).click();

  await expect(page.getByRole('status')).toHaveText('Loi: Don toi da 5 dong');
});
```

Test đầu đi qua cả stack: trình duyệt → trang HTML → `fetch` → Fastify → use case → domain, và kiểm tra một con số (1.080.000, tức đã áp giảm 10%) để chứng minh các mảnh nối đúng, không kiểm tra lại quy tắc. Test thứ hai dùng `page.route` để giả lập một lỗi API ở tầng mạng và kiểm tra UI hiển thị lỗi, một ca mà dựng bằng server thật sẽ tốn công.

Cấu hình (`lab/playwright.config.ts`):

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8080', trace: 'on-first-retry' },
  webServer: {
    command: 'node src/server.ts',
    url: 'http://127.0.0.1:8080/',
    env: { API_TOKEN: 'dev-token', PORT: '8080' },
    reuseExistingServer: false,
  },
});
```

`webServer` khởi động ứng dụng thật bằng `node src/server.ts` (Node chạy thẳng file TypeScript nhờ type stripping, không cần bước build; đó là lý do `tsconfig.json` bật `erasableSyntaxOnly` và import có đuôi `.ts`), chờ URL trả lời rồi mới chạy test. Server ở chế độ in-memory (không có `DATABASE_URL`), nên E2E của lab không cần PostgreSQL; E2E thật nên chạy với DB thật.

Điểm quan trọng: dùng locator theo role/label (`getByRole`, `getByLabel`, `getByText`) thay vì CSS dễ đổi; `expect(...)` của Playwright tự wait-and-retry; `trace: 'on-first-retry'` lưu trace khi chạy lại để gỡ lỗi; `retries` chỉ bật ở CI (xem mục 4 về rủi ro).

**Chạy trong Docker.** Playwright cần trình duyệt và thư viện hệ thống, nên dùng image chính thức khớp đúng phiên bản package (`mcr.microsoft.com/playwright:v1.65.0-noble`, trình duyệt đã có sẵn trong image). Lệnh của lab: `./run.sh e2e`, tương đương `docker run --rm --ipc=host -v <lab>:/app -v <volume node_modules>:/app/node_modules -w /app mcr.microsoft.com/playwright:v1.65.0-noble npx playwright test`. `--ipc=host` là khuyến nghị trong docs của Playwright để Chromium không hết shared memory. Node trong image Playwright là bản đi kèm image (không nhất thiết là 26); vì `node src/server.ts` chỉ cần type stripping nên vẫn chạy. Lần đầu bạn nên kéo image trước (`docker pull mcr.microsoft.com/playwright:v1.65.0-noble`) và chấp nhận dung lượng lớn: image chứa sẵn Chromium, Firefox và WebKit.

Với hệ sinh thái khác (Cypress, WebdriverIO, Selenium) bạn cũng có lựa chọn; Playwright được chọn vì có runner, auto-wait, trace viewer và đa trình duyệt sẵn. Mình chưa so sánh bằng thực nghiệm.

## 4. Flaky tests: causes and cures

| Nguyên nhân | Dấu hiệu | Cách chữa |
|---|---|---|
| Chờ cố định (`setTimeout`, `page.waitForTimeout`) | xanh/đỏ tùy tải máy | chờ theo điều kiện (auto-wait, `expect.poll`, `vi.waitFor`) |
| Dữ liệu chung giữa test | phụ thuộc thứ tự chạy | dữ liệu riêng mỗi test, rollback/dọn dẹp (chương 6) |
| Real time, randomness | lỗi theo giờ/ngày | `Clock` có thể điều khiển (`FixedClock`), `vi.useFakeTimers()`, seed cố định (fast-check `seed`) |
| Infrastructure chưa sẵn sàng | test đầu tiên đỏ | healthcheck (`pg_isready`) trước khi chạy |
| Chạy parallel dùng chung resource | đỏ khi bật parallel | isolation DB/port theo worker (cổng 0 hoặc `inject`) |
| Phụ thuộc dịch vụ ngoài thật | lỗi mạng | fake/stub ở boundary, contract test (chương 9) |
| Thứ tự non-deterministic (`SELECT` không `ORDER BY`, `Promise.race`) | đỏ ngẫu nhiên | sắp xếp rõ ràng trước khi so |
| Quên `await` | xanh giả hoặc đỏ ngẫu nhiên tùy lúc promise xong | bật lint `no-floating-promises` (typescript-eslint); luôn `await expect(...).rejects` |

Trong lab, mọi thứ non-deterministic đã bị loại ngay từ thiết kế: `FixedClock`, id cố định, `seed: 20261107` cho fast-check, DB bọc rollback, `pg_isready` trước khi chạy, cổng ngẫu nhiên hoặc `inject` cho HTTP. Ca E2E duy nhất có dữ liệu động là id `web-<timestamp>` do trang tạo, và test khớp bằng regex `web-\d+` thay vì giá trị cụ thể.

Quy trình xử lý test flaky: (1) **phát hiện**: theo dõi tỉ lệ đỏ-rồi-xanh khi retry (Vitest có `--retry`, Playwright có `retries` và gắn nhãn "flaky" trong báo cáo); (2) **quarantine** (cách ly): chuyển sang job không chặn merge, có hạn sửa; (3) **tìm root cause**; (4) **sửa hoặc xóa**. Cẩn thận với `retries`: nó che giấu vấn đề, chỉ nên dùng cho E2E và luôn báo cáo test cần retry.

## 5. Test data: builders and object mothers

Hai kỹ thuật tạo test data dễ đọc:

- **Test Data Builder**: giá trị mặc định hợp lệ, mỗi test chỉ nêu điều *liên quan*. Có trong lab (`lab/tests/support/order-builder.ts`):

```ts
export class OrderBuilder {
  readonly #spec: Spec;

  private constructor(spec: Spec) {
    this.#spec = spec;
  }

  static anOrder(): OrderBuilder {
    return new OrderBuilder({
      id: 'o-1',
      customerId: 'c-1',
      lines: [['SKU-1', 1, 100_000]],
      placed: false,
      paid: false,
    });
  }

  withLine(sku: string, qty: number, price: number): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, lines: [...this.#spec.lines, [sku, qty, price]] });
  }

  placed(): OrderBuilder {
    return new OrderBuilder({ ...this.#spec, placed: true });
  }
  // ... withId, withoutLines, paid, build()
}
```

Mỗi method trả về một builder **mới** (spread object, `lines` cũng được sao chép bằng spread), nên builder dùng chung không bị test pollution giữa các test. Đây là chỗ dễ sai trong JavaScript: nếu `withLine` chỉ `this.lines.push(...)` rồi `return this`, mọi test dùng chung một `const base = OrderBuilder.anOrder()` sẽ thấy dòng hàng của nhau. Dùng: `OrderBuilder.anOrder().withId('o-6').withoutLines().withLine('B', 1, 1_000_000).placed().build()` (từ `pay-order.test.ts`): test nói rõ "đơn một dòng 1.000.000 đã đặt" và không quan tâm khách hàng nào.

- **Object Mother**: module có các hàm dựng sẵn các nhân vật có tên (ví dụ `vipOrderPlaced()`; ví dụ minh họa, không có trong lab). Gọn khi nhiều test cần cùng một kịch bản, nhưng dễ phình thành "kho phép thuật" mà mỗi test phụ thuộc chi tiết ẩn. Khorikov và nhiều tác giả khuyên builder cho độ linh hoạt; có thể kết hợp (mother trả về builder đã cấu hình).

Quy tắc: dữ liệu mặc định phải **hợp lệ theo domain** (builder gọi `addLine` và `place` thật, nên không bao giờ tạo impossible state), và test chỉ nêu ra điều ảnh hưởng đến kết quả. Với test cần nhiều dữ liệu ngẫu nhiên hợp lệ, fast-check (chương 11) có thể sinh builder spec thay vì viết tay.

## 6. Directory structure and how to run

Lab chia theo thư mục dưới `tests/`: `unit`, `application`, `acceptance`, `characterization`, `contract` (gồm `pact/`), `integration`, `http`, `e2e`, và lệnh con tương ứng trong `run.sh`. Vitest chạy theo đường dẫn (`vitest run tests/unit`) hoặc theo tên (`-t AC-ORD-3`); Playwright có runner riêng (`testMatch: '*.spec.ts'`, còn Vitest chỉ gom `*.test.ts`, để hai runner không nhặt nhầm file của nhau). Thứ tự chạy khuyến nghị trong CI: suite nhanh trước, chậm sau, để phản hồi sớm.

```
typecheck -> unit -> application -> acceptance -> contract/characterization -> http -> integration -> (E2E, nightly)
```

## 7. Running in CI (not yet run)

Hai cách: dùng Docker như lab (nhất quán giữa máy dev và CI), hoặc cài runtime trên runner CI. Ví dụ GitHub Actions, minh họa:

```yaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: app }
        options: >-
          --health-cmd "pg_isready -U app" --health-interval 5s
          --health-timeout 5s --health-retries 10
        ports: ["5432:5432"]
    env:
      DATABASE_URL: postgres://app:app@127.0.0.1:5432/app
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 26, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
```

Ghi chú: phiên bản các action (`@v5`) và `node-version` có thể đã đổi, hãy kiểm tra trang của chúng. Biến `CI=true` có sẵn trên GitHub Actions nên Vitest không tự ghi snapshot (chương 10) và Playwright bật `retries`. Mutation test (`npx stryker run`) nên chạy theo lịch hoặc chỉ trên phần diff (`--incremental`). Job E2E tách riêng, dùng image `mcr.microsoft.com/playwright` (hoặc `npx playwright install --with-deps`).

Thực hành tốt cho CI: giữ tổng thời gian bộ nhanh dưới vài phút; fail build khi test không có assertion (lab bật `expect.requireAssertions`) và khi `tsc` báo lỗi; lưu artifact (log, trace Playwright, báo cáo Stryker `reports/mutation/mutation.json`); cache `~/.npm`; cố định phiên bản Node bằng `engines` và image, vì lab phải ghim `typescript` ở 6.0.3 để Stryker chạy được (chương 11), nên CI và máy dev cần dùng cùng `package-lock.json`.

## 8. Trade-offs

- E2E ít mà chắc, không nhiều mà mong manh.
- Retry giúp pipeline xanh nhưng che bệnh; đo và giảm.
- Builder linh hoạt, mother tiện; đừng để dữ liệu mặc định ẩn điều quan trọng.
- Chạy mọi thứ ở mỗi commit hay chia tier: trade-off giữa fast feedback và độ coverage; chia tier (nhanh mỗi commit, chậm theo lịch) thường hợp lý.

## 9. Pitfalls

- `page.waitForTimeout(5000)` hoặc `await new Promise(r => setTimeout(r, 5000))` thay cho chờ điều kiện.
- E2E kiểm tra business rule chi tiết, nhân rộng số E2E mà không ai bảo trì.
- Retry mặc định cho mọi test.
- Builder dùng shared state (không sao chép) nên test này làm bẩn test kia.
- Quên healthcheck cho DB trong CI.
- CI và máy dev dùng phiên bản khác nhau (chạy cùng image Docker để tránh).
- Để Vitest nhặt file `*.spec.ts` của Playwright (hoặc ngược lại): hai runner có API `test`/`expect` khác nhau và sẽ báo lỗi khó hiểu.

## 10. Summary

- E2E chỉ cho critical user journey; Playwright có auto-wait và trace; lab đã chạy hai test trong image chính thức.
- Flaky test đến từ chờ cố định, dữ liệu chung, thời gian/ngẫu nhiên, infrastructure chưa sẵn sàng, `await` bị quên: loại bỏ bằng thiết kế deterministic.
- Builder cho dữ liệu hợp lệ, chỉ nêu điều liên quan, immutable; object mother cho kịch bản dựng sẵn.
- CI: chạy nhanh trước, chậm sau; fail khi test không có assertion hoặc `tsc` đỏ; nhất quán môi trường bằng Docker và lockfile.

## 11. Self-check questions

1. Vì sao `waitForTimeout(5000)` là nguồn flaky?
2. `OrderBuilder.withLine` trả builder mới thay vì sửa `this` để làm gì?
3. Khi nào nên quarantine (cách ly) một test flaky?
4. Vì sao E2E không nên kiểm tra ngưỡng giảm giá 1.000.000?
5. Vì sao Vitest và Playwright dùng hai đuôi file khác nhau (`.test.ts`, `.spec.ts`)?

<details><summary>Answer</summary>

1. Thời gian cần thực tế biến thiên theo tải; chờ cố định hoặc quá ngắn (đỏ) hoặc quá dài (chậm). Phải chờ theo điều kiện có timeout.
2. Để builder immutable: mỗi test có bản riêng, không bị ô nhiễm bởi test khác dùng chung biến builder.
3. Khi đã xác nhận nó flaky mà chưa kịp sửa: chuyển ra job không chặn merge, có hạn sửa, để không làm mất niềm tin vào bộ test chính.
4. Chậm và brittle; business rule đã được kiểm tra ở unit/acceptance. E2E chỉ cần xác nhận user journey nối đúng.
5. Để mỗi runner chỉ nhặt đúng file của nó qua `include`/`testMatch`; hai runner có `test`/`expect` khác nhau.
</details>
