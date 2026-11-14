# Triển khai an toàn: container, CI/CD và zero-downtime

Bản học tiếng Việt cho developer backend (Go, Node.js/TypeScript, PostgreSQL) muốn đưa code lên production mà không làm sập hệ thống. Kiểm tra thực tế ngày 08/11/2026.

## Ai nên đọc, cần biết gì

- Đã viết ứng dụng web (Go hoặc Node.js/TypeScript), biết dùng Git và dòng lệnh.
- Biết SQL cơ bản. Chưa cần biết Docker hay Kubernetes.
- Cần Docker trên máy để chạy lab (không cài gì khác).

## Mục lục

1. [Container căn bản cho developer](01-container-basics.md)
2. [Dockerfile production cho Go và Node.js, cấu hình và secrets](02-production-dockerfiles-go-nodejs.md)
3. [Docker Compose cho dev và test](03-docker-compose.md)
4. [CI: pipeline và GitHub Actions](04-ci-github-actions.md)
5. [Chiến lược release: rolling, blue-green, canary, shadow](05-release-strategies.md)
6. [Feature flag, dark launch, kill switch](06-feature-flag.md)
7. [Migration DB không downtime](07-zero-downtime-migrations.md)
8. [Kubernetes căn bản cho developer](08-kubernetes-basics.md)
9. [GitOps, Helm và Kustomize](09-gitops-helm-kustomize.md)
10. [Supply chain tối thiểu: scan, SBOM, sign image](10-minimal-supply-chain-security.md)
11. [Checklist trước deploy và quy trình rollback](11-checklist-and-rollback.md)

Ví dụ xuyên suốt: hai service nhỏ `deploy-demo` viết bằng Go và Node.js/TypeScript (endpoint `/healthz`, graceful shutdown) và bảng `orders(id, customer_id, total, status, created_at)`; migration `total` (int) sang `total_cents` (bigint).

## Phiên bản đã dùng hoặc đã kiểm tra

| Thành phần | Phiên bản | Cách kiểm tra |
|---|---|---|
| Go | 1.27.3 (`golang:1.27-alpine`) | chạy thật |
| Node.js | 26.13.0 LTS (`node:26-slim`, `node:lts-slim`) | chạy thật |
| TypeScript, `@types/node` | 7.0.2, 26.6.6 | chạy thật (`npm ci`, `tsc`) |
| `gcr.io/distroless/static-debian13:nonroot` | Debian 13.7 | chạy thật |
| Trivy | 0.76.0 | chạy thật |
| PostgreSQL | 18.6 (`postgres:latest`) | chạy thật |
| hadolint | 2.15.1 | chạy thật |
| actionlint | 1.7.12 | chạy thật |
| kubeconform | v0.8.0, schema Kubernetes 1.37.0 | chạy thật |
| Kubernetes | 1.37 (1.37.1) mới nhất | kubernetes.io/releases (không chạy cluster) |
| `actions/checkout` | v7.0.1 (SHA 3d3c42e5...) | GitHub releases, `git ls-remote` |
| Argo CD / Flux / Helm | v3.6.1 / v2.10.0 / v4.3.1 | trang release GitHub, chưa chạy |
| cosign | v3.1.4 | trang release GitHub, chưa chạy |

Chưa xác minh: phiên bản SDK Go và Node.js của OpenFeature, số phiên bản mới nhất của Gateway API (các nguồn mâu thuẫn).

## Lab

Mọi thứ chạy trong Docker; container, network, volume đều mang tiền tố `bookcheck-deploygo-`. Không map port ra host.

```
lab/
  go-app/                 service Go (/healthz, graceful shutdown) + Dockerfile multi-stage distroless
  node-app/               service Node.js/TypeScript tương tự + Dockerfile multi-stage, ci.sh
  bad/                    Dockerfile tệ (Go, Node) cho hadolint bắt; bản "ngây thơ" để so kích thước
  compose.yaml            dev/test: app (Go), web (Node), PostgreSQL 18 (profile test)
  shutdown-test.sh        chứng minh graceful shutdown: SIGTERM giữa lúc có request đang chạy
  .github/workflows/      ci.yml (sạch) và bad.yml (actionlint bắt lỗi)
  k8s/                    app.yaml (hợp lệ), broken.yaml (cố tình sai)
  migration/              run.sh + 01-seed.sql: lab lock PostgreSQL
```

Lệnh chạy lại (từ thư mục `lab/`; trên Git Bash Windows thêm `export MSYS_NO_PATHCONV=1`):

```bash
# 1. Test và build (chương 1, 2)
docker run --rm -v "$PWD/go-app:/src" -w /src golang:1.27-alpine sh -c "go vet ./... && go test ./..."
docker run --rm -v "$PWD/node-app:/app" node:26-slim sh /app/ci.sh        # npm ci, tsc, node --test
docker build -t bookcheck-deploygo-go:1.0 --build-arg APP_VERSION=1.0 go-app
docker build -t bookcheck-deploygo-node:1.0 --build-arg APP_VERSION=1.0 node-app
docker build -t bookcheck-deploygo-naive-go:1.0 -f bad/Dockerfile.naive go-app
docker build -t bookcheck-deploygo-naive-node:1.0 -f bad/Dockerfile.naive-node node-app
docker images --filter 'reference=bookcheck-deploygo-*'
docker network create bookcheck-deploygo-net
docker run -d --name bookcheck-deploygo-go --network bookcheck-deploygo-net bookcheck-deploygo-go:1.0
docker inspect -f '{{.State.Health.Status}}' bookcheck-deploygo-go      # healthy sau ~15 s
docker rm -f bookcheck-deploygo-go

# 2. Graceful shutdown (chương 2): SIGTERM trong lúc request 6 s đang chạy
bash shutdown-test.sh bookcheck-deploygo-go:1.0
bash shutdown-test.sh bookcheck-deploygo-node:1.0
bash shutdown-test.sh bookcheck-deploygo-naive-node:1.0                  # đối chứng npm start: request bị cắt
docker network rm bookcheck-deploygo-net

# 3. Lint và scan
docker run --rm -i hadolint/hadolint:latest-alpine < go-app/Dockerfile
docker run --rm -i hadolint/hadolint:latest-alpine < node-app/Dockerfile
docker run --rm -i hadolint/hadolint:latest-alpine < bad/Dockerfile
docker run --rm -i hadolint/hadolint:latest-alpine < bad/Dockerfile.node
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image \
  --scanners vuln --severity HIGH,CRITICAL bookcheck-deploygo-go:1.0
docker run --rm -v "$PWD/.github/workflows:/w:ro" rhysd/actionlint:latest -color=false /w/ci.yml /w/bad.yml
docker run --rm -v "$PWD/k8s:/k:ro" ghcr.io/yannh/kubeconform:latest -strict -summary \
  -kubernetes-version 1.37.0 -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' /k/app.yaml

# 4. Compose (chương 3)
docker compose up -d --build && docker compose --profile test run --rm tests
docker compose --profile test down -v

# 5. Lab lock PostgreSQL (chương 7); tự xóa container
bash migration/run.sh                          # đầy đủ (vài phút, ~2 triệu dòng)
ROWS=300000 ONLY=EFG bash migration/run.sh     # chỉ phần E-G, nhẹ
```

Tóm tắt kết quả đã chạy:

- Image: Go multi-stage `distroless/static` **17 MB** (bản ngây thơ `golang` **1,44 GB**); Node `node:26-slim` multi-stage **353 MB** (bản ngây thơ `node:26` **1,85 GB**). Cả hai `healthy`, chạy non-root (uid 65532 và 1000).
- Graceful shutdown: SIGTERM giữa lúc request 6 s đang chạy, cả Go và Node đều trả `200` rồi thoát exit 0; bản `CMD ["npm", "start"]` làm request bị cắt (`UND_ERR_SOCKET`).
- hadolint: hai Dockerfile tốt pass; Dockerfile xấu Go có 5 warning (DL3007, DL3008, DL3009, DL3015, DL3003), bản Node thêm DL3025.
- Trivy 0.76.0: image Go 0 HIGH/CRITICAL; image Node 48 HIGH (package Debian) + 6 HIGH (package npm trong chính `npm`), 0 CRITICAL.
- actionlint: `ci.yml` (Go + Node) sạch; `bad.yml` có 2 lỗi (input không tin cậy, cú pháp biểu thức).
- kubeconform: `app.yaml` 7/7 hợp lệ; `broken.yaml` bị bắt (sai kiểu).
- PostgreSQL 18.6: `CREATE INDEX` thường chặn INSERT 5,2 s; `CONCURRENTLY` không chờ lock (167 ms lớn nhất do resource contention); `ALTER COLUMN TYPE bigint` chặn INSERT 20,1 s dưới `AccessExclusiveLock` (số liệu lab migration giữ nguyên từ lần chạy trước, chỉ đổi tiền tố tên container).
- Chưa chạy: cluster Kubernetes thật (manifest chỉ được validate), MySQL online DDL, cosign, Argo CD/Flux/Helm, blue-green thật.

## Đọc thêm

1. Jez Humble, David Farley, *Continuous Delivery* (Addison-Wesley, 2010): nền tảng của deployment pipeline.
2. Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* (IT Revolution, 2018): bốn metric DORA và bằng chứng thống kê.
3. Tài liệu Kubernetes: kubernetes.io/docs (Concepts, Workloads, Configure Liveness, Readiness and Startup Probes).
4. Docker docs: "Building best practices" và "Multi-stage builds" (docs.docker.com).
5. GitHub Docs: "Security hardening for GitHub Actions" và "OpenID Connect".
6. Tài liệu PostgreSQL: "Explicit Locking" (chương 13) và `CREATE INDEX` (mục Building Indexes Concurrently); README của `strong_migrations` (Andrew Kane) về các thao tác migration nguy hiểm.
