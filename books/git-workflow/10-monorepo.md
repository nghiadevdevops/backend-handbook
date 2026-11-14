# Chapter 10. Monorepo

## The problem

Repo có `services/orders` (Go), `services/web` (TypeScript) và `packages/shared` (TypeScript). Mỗi PR chạy toàn bộ test của mọi thứ thì CI mất 40 phút; mỗi package release riêng thì phải biết cái nào đổi. Monorepo cần ba thứ: quy ước cấu trúc, ownership theo thư mục và CI theo path.

## When to choose a monorepo

| Hợp | Không hợp |
|---|---|
| Nhiều package thay đổi cùng nhau (shared lib, API và client) | Các team hoàn toàn độc lập, quyền truy cập tách biệt |
| Muốn một PR đổi nhiều thành phần (atomic change) | Repo lớn tới mức clone/CI không còn chịu được và chưa có tooling |
| Chia sẻ tooling, lint, CI | Release cycle và license khác nhau hẳn |

Git workflow trong monorepo vẫn là một trunk duy nhất (Chương 5); độ phức tạp nằm ở CI và release.

## TypeScript: workspaces and changesets

npm và pnpm đều có workspaces:

```json
// package.json (root)
{
  "private": true,
  "workspaces": ["packages/*", "services/web"]
}
```

pnpm dùng `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "services/web"
```

Package nội bộ tham chiếu nhau bằng version (npm: `"@acme/shared": "*"`) hoặc `workspace:*` (pnpm). Mỗi package tự có `package.json` và version riêng.

**Changesets** (Chương 9) rất hợp ở đây: mỗi PR thêm một file changeset nói package nào bump loại gì. `changeset version` bump cả package phụ thuộc (dependents) tự động, và `changeset publish` chỉ publish package đổi. Cấu hình ở `.changeset/config.json` (`"updateInternalDependencies"`, `"ignore"`...).

## Go: multi-module and go.work

Hai lựa chọn:
- **Một module cho cả repo** (một `go.mod` ở root): đơn giản nhất, một version cho tất cả. Chọn khi không cần release riêng từng phần.
- **Multi-module**: mỗi thư mục có `go.mod` riêng, version độc lập, tag có tiền tố thư mục (`services/orders/v1.2.0`, Chương 9).

`go.work` (từ Go 1.18) cho phép làm việc với nhiều module cục bộ cùng lúc mà không cần `replace` trong `go.mod`:

```sh
go work init ./services/orders ./packages/shared
go work use ./services/billing
```

```
// go.work
go 1.27

use (
    ./services/orders
    ./packages/shared
)
```

Khuyến nghị chung: **không commit `go.work`** nếu nó chỉ phục vụ môi trường dev cá nhân và CI cần chạy với version module đã publish (một số team lại commit để CI kiểm tra cả cụm). Chọn một cách và ghi vào tài liệu team. `go work sync` đồng bộ phụ thuộc. Lưu ý `replace` trong `go.mod` của module bị bỏ qua khi module đó được dùng như dependency, còn `go.work` không bao giờ ảnh hưởng người dùng bên ngoài.

## CODEOWNERS by directory

```
# .github/CODEOWNERS
/services/orders/    @acme/orders-team
/services/web/       @acme/web-team
/packages/shared/    @acme/platform-team @acme/web-team
/.github/workflows/  @acme/platform-team
/go.work             @acme/platform-team
```

`packages/shared` có hai team làm owner: chỉ cần đủ yêu cầu theo cấu hình ruleset (thường một owner approve). Thay đổi shared nên cần review rộng hơn vì ảnh hưởng nhiều service.

## Path-based CI

GitHub Actions lọc theo path ở cấp workflow:

```yaml
on:
  pull_request:
    paths:
      - "services/orders/**"
      - "packages/shared/**"
```

Cạm bẫy lớn: workflow bị lọc path sẽ không chạy, check bắt buộc không xuất hiện và PR kẹt (Chương 8). Giải pháp phổ biến: chạy một workflow luôn luôn, trong đó job đầu dùng một action phát hiện path đổi (ví dụ `dorny/paths-filter`; kiểm tra phiên bản và trạng thái trước khi dùng) hoặc `git diff --name-only origin/main...HEAD` để xuất ra output, các job sau chạy có điều kiện `if:`, rồi một job tổng hợp `ci-ok` là check duy nhất bắt buộc.

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      orders: ${{ steps.f.outputs.orders }}
    steps:
      - uses: actions/checkout@v4
      - id: f
        uses: dorny/paths-filter@v3
        with:
          filters: |
            orders:
              - 'services/orders/**'
              - 'packages/shared/**'
  test-orders:
    needs: changes
    if: needs.changes.outputs.orders == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: go test ./...
        working-directory: services/orders
  ci-ok:
    if: always()
    needs: [test-orders]
    runs-on: ubuntu-latest
    steps:
      - run: test "${{ contains(needs.*.result, 'failure') }}" = "false"
```

(Đoạn YAML trên chưa chạy thử vì cần GitHub Actions; phiên bản action `v3`, `v4` chưa xác minh với release mới nhất.) Với repo lớn hơn, công cụ build có đồ thị phụ thuộc (Nx, Turborepo, Bazel) tính affected target tự động; đánh giá khi tự viết lọc path thành gánh nặng.

Dùng sparse-checkout và partial clone khi repo lớn: `git clone --filter=blob:none --sparse`, rồi `git sparse-checkout set services/orders`.

## Pitfalls

- Path filter làm required check biến mất (xem trên).
- Một thay đổi trong `packages/shared` không kích hoạt test của service dùng nó (quên khai báo path phụ thuộc).
- Tag Go multi-module thiếu tiền tố thư mục.
- CODEOWNERS quá chi tiết gây nghẽn review.
- Commit lockfile conflict liên tục: rebase thường xuyên và regenerate lockfile thay vì merge tay.

## Summary

- Monorepo vẫn dùng trunk-based; khó khăn là CI và release.
- TS: npm/pnpm workspaces cộng changesets; Go: một module hoặc multi-module cộng `go.work`.
- CODEOWNERS theo thư mục xác định người review.
- CI theo path cần job tổng hợp `ci-ok` để không kẹt required checks.

## Self-check questions

1. Khi nào nên chọn multi-module trong Go?
2. `go.work` khác `replace` ở điểm nào?
3. Vì sao path filter ở cấp workflow có thể làm PR kẹt?
4. Changesets giúp gì trong monorepo?

<details><summary>Answer</summary>

1. Khi các phần cần version và release độc lập.
2. `go.work` chỉ ảnh hưởng môi trường làm việc cục bộ và không tác động tới người dùng module; `replace` nằm trong `go.mod` và bị bỏ qua khi module là dependency của module khác.
3. Workflow không chạy thì required check không bao giờ được báo cáo.
4. Mỗi PR khai báo package nào bump gì, tự cập nhật dependents, và chỉ publish package thay đổi.

</details>
