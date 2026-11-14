# Chapter 12. Software Supply Chain

## 1. The problem

Một ứng dụng Node.js điển hình có vài trăm đến hàng nghìn package trong `node_modules/` (kể cả transitive dependency), bạn chỉ chủ động chọn vài chục. Mỗi package là code chạy với quyền của ứng dụng. Attacker không cần vào hệ thống của bạn, chỉ cần: tìm CVE trong phiên bản bạn đang dùng; chiếm tài khoản maintainer; đăng package tên gần giống (typosquatting); hoặc tấn công pipeline build. OWASP Top 10:2025 nâng mục này thành **A03: Software Supply Chain Failures** (mở rộng từ "Vulnerable and Outdated Components").

## 2. Dependency scanning

### `npm audit`

`npm audit` so các package trong lockfile (`package-lock.json`) với advisory database của GitHub (GitHub Advisory Database) và in báo cáo, kể cả dependency gián tiếp. Cờ hữu ích: `--package-lock-only` (chỉ đọc lockfile, không cần `node_modules`), `--omit=dev` (bỏ devDependencies), `--audit-level=high` (chỉ coi high trở lên là lỗi), `--json` (cho máy đọc, CI). Lệnh trả **exit code khác 0** khi có advisory đạt ngưỡng, nên đặt vào CI để chặn merge. Lab của sách chạy thật trên `lab/audit/package.json` ghim phiên bản cũ (`express 4.17.1`, `jsonwebtoken 8.5.1`, `lodash 4.17.15`, `minimist 1.2.5`, `axios 0.21.1`), trong container `node:lts-alpine` (npm 11.20.0):

```bash
npm install --package-lock-only --ignore-scripts   # chỉ tạo package-lock.json
npm audit --package-lock-only                       # đọc lockfile, không cần node_modules
```

Kết quả thật (`lab/KET-QUA.md`, mục 6; exit code 1). Trích:

```
axios  <=0.32.0
Severity: high
Axios Cross-Site Request Forgery Vulnerability - https://github.com/advisories/GHSA-wf5p-g6vw-rhxx
Axios: Authentication Bypass via Prototype Pollution Gadget in `validateStatus` Merge Strategy - https://github.com/advisories/GHSA-w9j2-pvgh-6h63
...
jsonwebtoken  <=8.5.1
Severity: high
jsonwebtoken vulnerable to signature validation bypass due to insecure default algorithm in jwt.verify() - https://github.com/advisories/GHSA-qwph-4952-7xr6
...
minimist  1.0.0 - 1.2.5
Severity: critical
Prototype Pollution in minimist - https://github.com/advisories/GHSA-xvch-5gv4-984h

11 vulnerabilities (3 low, 7 high, 1 critical)
```

Hai điểm đáng chú ý. Một: 5 dependency trực tiếp kéo theo 11 package bị ảnh hưởng, vì `express 4.17.1` kéo theo `body-parser`, `qs`, `path-to-regexp`, `send`, `cookie`, `serve-static` đều có advisory (lỗi nằm ở dependency gián tiếp mà bạn không chọn). Hai: advisory critical là prototype pollution của `minimist`, và advisory `jsonwebtoken` (algorithm confusion) khớp với chương 7: nhóm lỗi đặc thù JavaScript (chương 10) cũng là thứ `npm audit` bắt được. Số lượng advisory thay đổi theo ngày. `npm audit fix` tự nâng phiên bản trong phạm vi semver; `--force` có thể nâng major (breaking), như báo cáo cảnh báo "outside the stated dependency range": đọc kỹ trước khi dùng.

Công cụ bổ sung (tùy nhu cầu): OSV-Scanner (Google, đa ngôn ngữ, dựa osv.dev), Trivy hoặc Grype (quét cả image container và filesystem), Snyk (thương mại).

Quét phát hiện **vulnerability đã biết**, không phát hiện package độc hại chưa ai báo cáo (đã có các đợt tấn công chiếm tài khoản maintainer và phát tán mã độc qua npm; hãy theo dõi bản tin bảo mật của npm/GitHub, chưa liệt kê chi tiết từng vụ ở đây).

### Disciplined updates

- **Dependabot** (GitHub) hoặc **Renovate** (mã nguồn mở, nhiều nền tảng) tự mở pull request nâng phiên bản. Renovate linh hoạt hơn (gộp nhóm, lịch, automerge theo quy tắc); Dependabot tích hợp sẵn trong GitHub, cấu hình đơn giản (`.github/dependabot.yml`).
- Có test tự động đủ tin cậy thì mới dám automerge patch.
- Phân loại: patch bảo mật nâng ngay; nâng major theo lịch.
- Cooldown/release delay (chờ vài ngày trước khi nhận phiên bản mới nhất) giảm rủi ro dính bản độc hại vừa bị đẩy lên (Renovate có `minimumReleaseAge`, pnpm có `minimumReleaseAge`; với npm CLI chưa xác minh tùy chọn tương đương, kiểm tra tài liệu bản bạn dùng).

## 3. Controlling sources and versions

- **Commit `package-lock.json`** cho ứng dụng; cài bằng **`npm ci`** (cài đúng theo lockfile, xóa `node_modules` cũ, báo lỗi nếu `package.json` và lockfile lệch nhau), không `npm install` trong CI/production. Lab dùng chính cách này: `lab/app/start.sh` chạy `npm ci --omit=dev`.
- `npm ci --omit=dev --ignore-scripts` khi build production nếu không có dependency nào cần script cài đặt (lifecycle script `postinstall` là điểm thực thi mã từ package bất kỳ); với package cần build native (như `argon2`) hãy cho phép tường minh từng cái. Lab chạy `argon2` bằng prebuilt binary, không cần compile.
- Ghim phiên bản chính xác cho dependency quan trọng (`save-exact=true` trong `.npmrc`, hoặc ghi số phiên bản không có `^`); lockfile đã ghim phiên bản, nhưng `package.json` ghim giúp review diff dễ hơn.
- Giảm số dependency: mỗi package là bề mặt tấn công. Trước khi thêm, xem độ phổ biến, hoạt động bảo trì (ví dụ `csurf` đã bị archive), có cần không. Dùng thư viện chuẩn của Node (`node:test`, `node:crypto`, `node:http`) khi đủ.
- Kiểm tra tên package (typosquatting), ưu tiên package có maintainer rõ ràng và có provenance.
- Nếu dùng registry riêng (Verdaccio, Artifactory, GitHub Packages), chống **dependency confusion**: dùng package có **scope** (`@acme/...`) và cấu hình `.npmrc` ánh xạ scope đó sang registry riêng, để package nội bộ không bị thay bằng bản công khai trùng tên.

### npm package provenance

Package có thể được publish **kèm provenance**: khi publish từ CI hỗ trợ (ví dụ GitHub Actions với quyền `id-token: write`) bằng `npm publish --provenance`, registry lưu một attestation (Sigstore) ghi rõ package được build từ commit nào, bởi workflow nào. Phía người dùng: `npm audit signatures` kiểm tra chữ ký registry và attestation provenance của các package đã cài (cần `node_modules` đã có, nên lab này chưa chạy lệnh đó). Provenance chứng minh "package này đến từ repo/workflow X", không chứng minh code trong repo đó an toàn. Gần đây npm cũng hỗ trợ "trusted publishing" qua OIDC để khỏi giữ token publish dài hạn (chưa xác minh chi tiết trong lần viết này; đối chiếu docs.npmjs.com).

## 4. SBOM

**Software Bill of Materials**: danh sách thành phần của phần mềm (tên, phiên bản, license, hash). Hai định dạng chính: **CycloneDX** (OWASP/Ecma) và **SPDX** (Linux Foundation, chuẩn ISO). Giá trị: khi có CVE mới, query SBOM trả lời trong vài phút "chúng ta có dùng thành phần này không, ở service nào". Sinh SBOM trong build:

- Node.js: `npm sbom --sbom-format cyclonedx` (có sẵn trong npm; hoặc `spdx`), hoặc `@cyclonedx/cyclonedx-npm`.
- Image/filesystem: `syft` (Anchore) hoặc `trivy sbom`.

(Các tên gói/công cụ trên là công cụ có thật; cờ dòng lệnh cụ thể hãy đối chiếu tài liệu từng công cụ, sách này chưa chạy thử chúng.)

SBOM chỉ là danh sách; phải kết nối với quét vulnerability (VEX giúp ghi nhận "CVE này không ảnh hưởng chúng ta vì...") mới có tác dụng.

## 5. Signing artifacts and Sigstore

Ký image/binary để người nhận **xác minh provenance và integrity**. **Sigstore** là bộ công cụ mã nguồn mở: `cosign` (ký/xác minh), `Fulcio` (CA cấp certificate ngắn hạn gắn với identity OIDC), `Rekor` (transparency log ghi lại chữ ký). Chế độ **keyless**: CI login bằng OIDC (ví dụ identity workflow GitHub Actions), nhận certificate sống vài phút, ký, rồi ghi vào Rekor; không phải giữ private key dài hạn.

```bash
# Ký image trong CI (keyless; cần quyền id-token: write trên GitHub Actions)
cosign sign ghcr.io/acme/shop@sha256:<digest>

# Xác minh: ràng buộc identity CI hợp lệ và nhà phát hành OIDC
cosign verify ghcr.io/acme/shop@sha256:<digest> \
  --certificate-identity-regexp '^https://github.com/acme/shop/\.github/workflows/release\.yml@refs/tags/.*$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Cosign hiện ở dòng 3.x (tra 11/2026 qua gói phân phối; bản mới nhất tôi thấy là 3.1.x, chưa xác minh trực tiếp từ GitHub releases). Hãy luôn ký theo **digest** (`@sha256:...`), không theo tag có thể bị đổi; và trên cluster deploy dùng admission policy (Kyverno, Sigstore policy-controller) để chỉ chạy image đã ký.

## 6. SLSA

**SLSA** ("salsa", Supply-chain Levels for Software Artifacts) là khung đánh giá độ tin cậy của quy trình build. Phiên bản đặc tả hiện tại: **v1.2** (tra tại slsa.dev/spec), gồm **Build Track** (artifact có được build bởi nền tảng đáng tin, kèm provenance không giả mạo được không) và **Source Track** (nguồn có được kiểm soát: review, lịch sử bảo vệ). Build Track chia mức: L1 (có provenance), L2 (build trên nền tảng được host, provenance được ký), L3 (nền tảng build cô lập, signing key không đụng được vào bởi bước build của người dùng); chi tiết yêu cầu từng mức sách này chưa tra lại kỹ trong lần viết, hãy đọc spec.

Thực hành với GitHub: dùng `actions/attest-build-provenance` hoặc workflow tái sử dụng `slsa-framework/slsa-github-generator` để sinh provenance, rồi xác minh khi deploy (`slsa-verifier`, hoặc `cosign verify-attestation`).

## 7. Controls around the pipeline

- Pin GitHub Actions bằng **commit SHA đầy đủ**, không theo tag (tag có thể bị trỏ lại, đã có incident thật khi action bị chiếm).
- `GITHUB_TOKEN` theo least privilege (`permissions:` khai tường minh); secret chỉ cho job cần.
- Bảo vệ nhánh chính (review bắt buộc, status check), commit ký.
- 2FA/passkey cho maintainer; tách môi trường build và deploy.
- Build có thể tái lập (reproducible) khi khả thi để kiểm chứng artifact.
- Image base: dùng bản chính thức, pin digest, cập nhật định kỳ.

## 8. Trade-offs

- Quét + cập nhật tự động: rẻ, hiệu quả cao; tốn công triage false positive (CVE không ở đường code bạn dùng).
- Ký + SLSA + SBOM đầy đủ: đáng với phần mềm phân phối cho nhiều bên hoặc ngành quy định; thừa cho ứng dụng nội bộ nhỏ, nơi `npm audit` + lockfile + Dependabot/Renovate đã chiếm phần lớn giá trị.
- Pin phiên bản cứng: ổn định nhưng dễ tụt hậu patch nếu không có tự động cập nhật.

## 9. Pitfalls

- Không commit lockfile, hoặc chạy `npm install` (thay vì `npm ci`) khi build/deploy.
- Bỏ qua kết quả `npm audit` vì "toàn lỗi nhỏ", rồi lộ critical.
- Dependabot mở 40 PR không ai xem; không có test nên không dám merge.
- Ký image theo tag; không bao giờ xác minh chữ ký (ký mà không verify thì vô nghĩa).
- Tin `latest` của image base.

## 10. Summary

- Supply chain là A03:2025; mỗi package là code bạn chạy.
- `npm audit` (và `npm ci`) trong CI + lockfile + Dependabot/Renovate là nền tảng.
- SBOM (CycloneDX/SPDX) để query nhanh khi có CVE mới.
- Ký bằng Sigstore/cosign (keyless), minh bạch qua Rekor; SLSA v1.2 để đánh giá quy trình build; nhớ verify.

## 11. Self-check questions

1. `npm audit` phát hiện được và không phát hiện được gì?
2. Vì sao ký image theo digest tốt hơn theo tag?
3. Keyless signing của Sigstore thay thế việc gì?
4. Dependency confusion là gì?

<details><summary>Answer</summary>

1. Phát hiện vulnerability đã có advisory trong package đã cài hoặc có trong lock file; không phát hiện package độc hại chưa được báo cáo hoặc lỗi trong code của bạn.
2. Tag có thể bị trỏ sang image khác, digest bất biến theo nội dung.
3. Việc giữ private signing key dài hạn: dùng certificate ngắn hạn gắn identity OIDC và ghi vào Rekor.
4. Attacker đăng package công khai trùng tên package nội bộ (phiên bản cao hơn) để trình quản lý gói cài nhầm bản độc hại.
</details>
