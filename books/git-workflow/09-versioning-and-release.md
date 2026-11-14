# Chương 9. Versioning và release

## Vấn đề

"Bản nào đang chạy production? Fix này nằm trong release nào? Nâng từ 1.4 lên 1.5 có phá client không?" Release có kỷ luật trả lời được cả ba câu bằng version, tag và changelog.

## SemVer

Semantic Versioning 2.0.0 (semver.org): `MAJOR.MINOR.PATCH`.
- MAJOR: thay đổi API không tương thích.
- MINOR: thêm tính năng tương thích ngược.
- PATCH: sửa lỗi tương thích ngược.
- Pre-release: `1.5.0-rc.1`; build metadata: `1.5.0+build.7`.
- `0.y.z` là giai đoạn phát triển ban đầu, không có bảo đảm ổn định.

Ánh xạ với Conventional Commits: `fix` thành PATCH, `feat` thành MINOR, `!`/`BREAKING CHANGE` thành MAJOR. Với dịch vụ web không có "người dùng nâng cấp", SemVer ít ý nghĩa; tag theo ngày hoặc build number (CalVer) cũng hợp lý, miễn là nhất quán.

## Tag

```sh
git tag -a v1.5.0 -m "Release 1.5.0"    # annotated: có tác giả, ngày, message
git tag -s v1.5.0 -m "Release 1.5.0"    # signed (GPG hoặc SSH, Chương 12)
git push origin v1.5.0                  # tag không tự được push
git push origin --follow-tags           # push commit kèm annotated tag liên quan
git tag -v v1.5.0                       # xác minh chữ ký
```

Dùng annotated (hoặc signed) tag cho release; lightweight tag chỉ cho đánh dấu tạm. Đừng di chuyển tag đã publish. Có thể bảo vệ tag `v*` bằng ruleset (cấm xóa, cấm cập nhật).

## Changelog tự động

Có hai họ công cụ, cả hai đọc Conventional Commits:

| Tool | Cách chạy | Phiên bản mới nhất tra được (11/2026) |
|---|---|---|
| semantic-release | tự động hoàn toàn trên CI: tính version, tag, publish, GitHub release | v25.0.9 (05/08/2026) |
| release-please (Google) | tạo "release PR" cập nhật changelog và version; merge PR đó thì tạo release | v17.11.2 (24/08/2026) |
| changesets | developer thêm file `.changeset/*.md` mô tả thay đổi và bump; hợp monorepo | `@changesets/cli` 3.0.3 (14/09/2026) |
| GoReleaser | build, đóng gói, checksum, ký, publish release cho Go | v2.20.0 (04/11/2026) |

Cả bốn đều đang được phát triển tích cực theo ngày release ở bảng. Số phiên bản lấy từ GitHub releases API.

**Chọn nhanh**: muốn không động tay, commit message là nguồn sự thật: semantic-release hoặc release-please (release-please cho phép con người xem và chỉnh PR trước khi release, an toàn hơn). Muốn tác giả PR chủ động mô tả bump, nhất là monorepo nhiều package: changesets.

## Release cho TypeScript/npm với changesets

```sh
npm i -D @changesets/cli
npx changeset init
npx changeset            # chọn package, loại bump, viết mô tả -> tạo .changeset/xxx.md
npx changeset version    # áp dụng bump, cập nhật CHANGELOG.md
npx changeset publish    # publish lên npm và tạo tag
```

Trên CI dùng `changesets/action`: nó mở PR "Version Packages" khi có changeset trên `main`, merge PR này thì publish. Khi publish lên npm từ CI nên bật provenance (`npm publish --provenance`) hoặc trusted publishing để người dùng xác minh nguồn build (kiểm tra docs npm cho cấu hình hiện hành).

Với release-please, thêm file `release-please-config.json` và workflow dùng `googleapis/release-please-action`; PR release tự sinh từ commit `feat`/`fix`.

## Release cho Go module

Go không có registry riêng: version của module chính là **git tag**.

- Tag `vX.Y.Z` trên commit của module: `git tag v1.5.0 && git push origin v1.5.0`. `go get example.com/orders@v1.5.0` sẽ lấy đúng tag đó (proxy.golang.org lưu bất biến, nên đừng sửa tag đã publish).
- **Major version ≥ 2 phải đổi module path**: `module example.com/orders/v2` trong `go.mod`, import `example.com/orders/v2/pkg`. Hai cách tổ chức: một thư mục `v2/` hoặc, phổ biến hơn, một nhánh `main` mang `go.mod` có `/v2`. Quy tắc import compatibility của Go: path mới cho API không tương thích.
- Module nằm trong thư mục con (monorepo): tag có tiền tố thư mục, ví dụ `services/orders/v1.5.0`.
- Pre-v1 (`v0.x`) cho phép đổi thoải mái.

**GoReleaser**: cấu hình `.goreleaser.yaml`, chạy `goreleaser release --clean` trong CI khi push tag `v*`; tạo binary đa nền tảng, archive, checksum, release note từ commit, và có thể ký bằng cosign. Thử không publish: `goreleaser release --snapshot --clean`. Kiểm tra cấu hình: `goreleaser check`.

```yaml
# .goreleaser.yaml (rút gọn)
version: 2
builds:
  - main: ./cmd/orders
    env: [CGO_ENABLED=0]
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
changelog:
  use: github
```

## Hotfix và cherry-pick

Trên trunk: fix vào `main` trước. Nếu bản đã phát hành khác `main` quá xa (hoặc `main` chứa feature chưa muốn phát hành), tạo `release/1.4` từ tag `v1.4.0`, rồi:

```sh
git switch -c release/1.4 v1.4.0
git cherry-pick -x <hash-fix-trên-main>   # -x ghi dòng "(cherry picked from commit ...)"
git tag -a v1.4.1 -m "Hotfix 1.4.1"
git push origin release/1.4 v1.4.1
```

`-x` giữ dấu vết nguồn gốc, giúp kiểm tra bản fix đã vào những nhánh nào (`git branch --contains <hash>`, `git cherry -v`). Với Git Flow, hotfix tách từ `main` rồi merge cả vào `main` và `develop` (Chương 3). Quy tắc chung: không bao giờ để bản fix chỉ tồn tại ở một nhánh release mà không có ở `main`.

## Cạm bẫy

- Quên `git push --tags`/`--follow-tags`: release trên máy bạn, không có trên remote.
- Move/xóa tag đã publish: Go proxy và npm đã cache, người dùng thấy nội dung khác nhau.
- Bump major nhưng quên đổi `module .../v2` trong Go.
- Dùng Conventional Commits nhưng PR title không theo chuẩn khiến release tool bỏ qua thay đổi.
- Publish npm bằng token dài hạn lưu trong secret thay vì trusted publishing/provenance.

## Tóm tắt

- SemVer ánh xạ trực tiếp từ Conventional Commits; tag annotated hoặc signed cho release.
- semantic-release và release-please tự động hóa từ commit; changesets từ file khai báo, hợp monorepo.
- Go module: version = git tag `vX.Y.Z`, major ≥ 2 đổi path `/vN`, GoReleaser đóng gói và publish.
- Hotfix: fix ở `main` trước, `cherry-pick -x` sang release branch, tag bản vá.

## Câu hỏi tự kiểm tra

1. Commit `feat(api)!: remove v1` làm version đi từ 1.4.2 tới đâu?
2. Vì sao không nên di chuyển tag đã push?
3. Go module ở major v3 cần thay đổi gì?
4. Lệnh nào ghi lại hash gốc khi cherry-pick?

<details><summary>Đáp án</summary>

1. 2.0.0 (breaking change nên bump MAJOR, reset MINOR và PATCH).
2. Người dùng, proxy (Go) hoặc registry đã cache bản cũ; cùng tên tag nhưng khác nội dung, mất tính tái lập.
3. Module path kết thúc bằng `/v3` trong `go.mod` và mọi import dùng path đó.
4. `git cherry-pick -x`.

</details>
