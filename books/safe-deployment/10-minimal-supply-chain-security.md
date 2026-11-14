# Chapter 10. Minimal Supply Chain: Scan, SBOM, Sign Images

> Chương này chỉ giới thiệu. Một cuốn bảo mật khác sẽ đi sâu hơn.

## 1. The problem

Image của bạn không chỉ chứa code của bạn: nó chứa base OS, runtime (Go stdlib hoặc Node.js), và hàng trăm module Go hoặc package npm. Một vulnerability (lỗ hổng bảo mật) trong bất kỳ thành phần nào đều là vulnerability của bạn. Và khi image đến cluster, làm sao biết nó đúng là image do pipeline của bạn build, không bị thay giữa chừng? Ba biện pháp tối thiểu: **vulnerability scanning**, **SBOM**, **image signing**.

## 2. Vulnerability scanning

Công cụ so sánh danh sách package trong image với vulnerability database (CVE). Phổ biến: **Trivy** (Aqua), Grype (Anchore), Docker Scout. Scan ở hai thời điểm: trong CI (chặn khi có vulnerability nghiêm trọng đã có patch) và định kỳ trên image đang chạy (vì vulnerability mới được công bố sau khi bạn deploy).

```bash
# chạy trong Docker, scan image local
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image --severity HIGH,CRITICAL --exit-code 1 myapp:1.0
```

(`--exit-code 1` làm bước CI thất bại khi tìm thấy vulnerability ở mức đã chọn; `--ignore-unfixed` bỏ qua vulnerability chưa có patch.) Kết quả scan thật của image lab xem mục 5.

Thực tế: số lượng kết quả có thể lớn; ưu tiên theo severity, đã có patch chưa, và có bị khai thác trên thực tế không. Image nhỏ (Alpine, distroless) ít package, ít finding hơn.

## 3. SBOM

**SBOM (Software Bill of Materials)** là danh sách thành phần của phần mềm. Hai định dạng chính: **SPDX** và **CycloneDX**. Khi có vulnerability mới (như Log4Shell), SBOM giúp trả lời trong vài phút "chúng ta có dùng thành phần đó không và ở đâu". Công cụ sinh SBOM: Trivy, Syft.

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image --format cyclonedx myapp:1.0 > sbom.cdx.json
```

Lưu SBOM cùng artifact (hoặc đính kèm vào image dưới dạng attestation) để tra cứu sau này.

## 4. Signing images with Sigstore/cosign

Signing để chứng minh provenance và integrity. **Sigstore** là hệ sinh thái mở; **cosign** là công cụ sign/verify image. Phiên bản mới nhất tôi tra được: cosign v3.1.4.

Hai kiểu:

1. **Key-based**: bạn quản lý cặp private/public key.
2. **Keyless**: không giữ long-lived key. Trong GitHub Actions, workflow xin token OIDC (`id-token: write`, chương 4); service Fulcio cấp certificate ngắn hạn gắn với identity của workflow; signature được ghi vào transparency log Rekor. Bên verify kiểm tra "signature này do workflow của repo X tạo".

```bash
# sign (keyless, trong CI có id-token) — sign theo DIGEST, không theo tag
cosign sign ghcr.io/example/deploy-demo@sha256:<digest>

# verify: nói rõ ai được phép sign
cosign verify ghcr.io/example/deploy-demo@sha256:<digest> \
  --certificate-identity-regexp 'https://github.com/example/deploy-demo/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Signature chỉ có giá trị khi có bước **verification enforcement**: một admission controller trong cluster (Kyverno, Sigstore policy-controller, Ratify...) từ chối Pod dùng image chưa signed. Sign mà không verify thì chỉ là trang trí. Phần lệnh cosign trên chưa chạy trong lab (cần identity OIDC thật); cú pháp theo tài liệu cosign.

## 5. Lab run: scanning the lab image


Lệnh (Trivy chạy trong Docker, mount docker.sock): `trivy image --scanners vuln --severity HIGH,CRITICAL <image>`. Kết quả thật cho hai image của lab:

| Image | Kết quả HIGH/CRITICAL |
|---|---|
| `bookcheck-deploygo-go:1.0` (distroless, Debian 13.7 + binary Go) | **0** ở OS và 0 ở `gobinary` (Trivy đọc build info trong binary Go nên biết cả module và phiên bản stdlib) |
| `bookcheck-deploygo-node:1.0` (`node:26-slim`, Debian 13.7) | **48 HIGH, 0 CRITICAL** ở package Debian (ví dụ `zlib1g`, `util-linux`, `perl-base`, `ncurses-base`, `libsystemd0`), cộng **6 HIGH** ở package npm của **chính `npm`** đi kèm image (`brace-expansion`, `undici` trong `/usr/local/lib/node_modules/npm`) |

Ý nghĩa: image Go gần như không có gì để scan nên sạch; image Node chứa cả hệ điều hành Debian cùng `npm`, mỗi thứ là một nguồn CVE. Hai cách giảm: dùng base ít package hơn (distroless nodejs, chưa build thử trong cuốn này) hoặc xóa `npm` khỏi image runtime nếu không cần (`rm -rf /usr/local/lib/node_modules/npm`; chưa thử). Nhiều CVE của Debian chưa có bản vá (`affected`), nên thường xử lý bằng cập nhật base image định kỳ thay vì ép pipeline đỏ. Hạn chế: Trivy chỉ biết package của OS và các lock file/binary nó nhận ra; "0" không chứng minh sạch hoàn toàn. Lab chưa chạy phần SBOM và cosign.

## 6. Trade-offs

- Scan chặn quá chặt (mọi CVE) làm pipeline đỏ liên tục và mọi người học cách bỏ qua; chọn threshold (HIGH/CRITICAL có patch) và có quy trình exception (VEX hoặc file ignore có hạn dùng).
- Sign keyless tiện nhưng phụ thuộc service công cộng Sigstore; tổ chức có yêu cầu riêng có thể tự vận hành.
- Cập nhật base image thường xuyên là biện pháp rẻ và hiệu quả nhất; bot cập nhật (Renovate/Dependabot) giúp.

## 7. Pitfalls

1. Scan một lần lúc build rồi không bao giờ scan lại.
2. Sign theo tag (có thể bị trỏ lại) thay vì digest.
3. Không có bước verify trong cluster.
4. SBOM sinh ra nhưng không lưu ở đâu để tra cứu.
5. Scan image nhưng quên lock file ứng dụng (`govulncheck` cho Go, `npm audit` cho Node).

## 8. Summary

- Vulnerability scanning trong CI và định kỳ; threshold hợp lý, có quy trình exception.
- SBOM (SPDX/CycloneDX) cho biết bạn chứa gì.
- cosign sign theo digest; keyless dùng OIDC của CI; phải có verify khi admission.
- `govulncheck` (Go) và `npm audit` (Node) bổ sung cho phần dependency của ứng dụng.

## 9. Self-check

1. Vì sao scan định kỳ cả image đang chạy?
2. SBOM giúp gì khi có CVE mới?
3. Vì sao sign theo digest?
4. Image signature không được verify thì có tác dụng gì?

<details><summary>Answer</summary>

1. Vulnerability được công bố sau khi deploy; image không đổi nhưng rủi ro đổi.
2. Tra nhanh có dùng thành phần bị ảnh hưởng không và ở đâu.
3. Digest cố định nội dung; tag có thể trỏ sang image khác sau khi sign.
4. Gần như không: kẻ tấn công vẫn chạy được image không signed.

</details>
