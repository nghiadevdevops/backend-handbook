# Safe Deployment

A study guide (written in Vietnamese) for backend developers (Go, Node.js/TypeScript, PostgreSQL) who want to ship code to production without taking the system down. Checked in practice on 2026-11-08.

## Who this book is for

- You have already written a web application (Go or Node.js/TypeScript) and know how to use Git and the command line.
- You know basic SQL. No Docker or Kubernetes knowledge is required yet.
- You need Docker on your machine to run the labs (nothing else to install).

## Contents

1. [Chapter 1. Container Basics for Developers](01-container-basics.md)
2. [Chapter 2. Production Dockerfiles for Go and Node.js, Configuration and Secrets](02-production-dockerfiles-go-nodejs.md)
3. [Chapter 3. Docker Compose for Dev and Test Environments](03-docker-compose.md)
4. [Chapter 4. CI: Pipelines and GitHub Actions](04-ci-github-actions.md)
5. [Chapter 5. Release Strategies: Rolling, Blue-Green, Canary, Shadow](05-release-strategies.md)
6. [Chapter 6. Feature Flags, Dark Launches, Kill Switches](06-feature-flag.md)
7. [Chapter 7. Zero-Downtime DB Migrations](07-zero-downtime-migrations.md)
8. [Chapter 8. Kubernetes Basics for Developers](08-kubernetes-basics.md)
9. [Chapter 9. GitOps, Helm and Kustomize](09-gitops-helm-kustomize.md)
10. [Chapter 10. Minimal Supply Chain: Scan, SBOM, Sign Images](10-minimal-supply-chain-security.md)
11. [Chapter 11. Pre-Deploy Checklist and Rollback Process](11-checklist-and-rollback.md)

The running example: two small `deploy-demo` services written in Go and Node.js/TypeScript (a `/healthz` endpoint, graceful shutdown) and an `orders(id, customer_id, total, status, created_at)` table; a migration from `total` (int) to `total_cents` (bigint).

## Versions

Used or checked in practice.

| Component | Version | How verified |
|---|---|---|
| Go | 1.27.3 (`golang:1.27-alpine`) | actually run |
| Node.js | 26.13.0 LTS (`node:26-slim`, `node:lts-slim`) | actually run |
| TypeScript, `@types/node` | 7.0.2, 26.6.6 | actually run (`npm ci`, `tsc`) |
| `gcr.io/distroless/static-debian13:nonroot` | Debian 13.7 | actually run |
| Trivy | 0.76.0 | actually run |
| PostgreSQL | 18.6 (`postgres:latest`) | actually run |
| hadolint | 2.15.1 | actually run |
| actionlint | 1.7.12 | actually run |
| kubeconform | v0.8.0, Kubernetes schema 1.37.0 | actually run |
| Kubernetes | 1.37 (1.37.1) latest | kubernetes.io/releases (no cluster run) |
| `actions/checkout` | v7.0.1 (SHA 3d3c42e5...) | GitHub releases, `git ls-remote` |
| Argo CD / Flux / Helm | v3.6.1 / v2.10.0 / v4.3.1 | GitHub release pages, not run |
| cosign | v3.1.4 | GitHub release page, not run |

Not verified: the Go and Node.js SDK versions of OpenFeature, and the latest Gateway API version number (sources contradict each other).

## Running the labs

Everything runs in Docker; containers, networks and volumes all carry the prefix `bookcheck-deploygo-`. No ports are mapped to the host.

```
lab/
  go-app/                 Go service (/healthz, graceful shutdown) + multi-stage distroless Dockerfile
  node-app/               similar Node.js/TypeScript service + multi-stage Dockerfile, ci.sh
  bad/                    bad Dockerfiles (Go, Node) for hadolint to catch; "naive" versions for size comparison
  compose.yaml            dev/test: app (Go), web (Node), PostgreSQL 18 (test profile)
  shutdown-test.sh        proves graceful shutdown: SIGTERM while a request is in flight
  .github/workflows/      ci.yml (clean) and bad.yml (actionlint catches the errors)
  k8s/                    app.yaml (valid), broken.yaml (deliberately wrong)
  migration/              run.sh + 01-seed.sql: PostgreSQL lock lab
```

Re-run commands (from the `lab/` directory; on Git Bash for Windows add `export MSYS_NO_PATHCONV=1`):

```bash
# 1. Test and build (chapters 1, 2)
docker run --rm -v "$PWD/go-app:/src" -w /src golang:1.27-alpine sh -c "go vet ./... && go test ./..."
docker run --rm -v "$PWD/node-app:/app" node:26-slim sh /app/ci.sh        # npm ci, tsc, node --test
docker build -t bookcheck-deploygo-go:1.0 --build-arg APP_VERSION=1.0 go-app
docker build -t bookcheck-deploygo-node:1.0 --build-arg APP_VERSION=1.0 node-app
docker build -t bookcheck-deploygo-naive-go:1.0 -f bad/Dockerfile.naive go-app
docker build -t bookcheck-deploygo-naive-node:1.0 -f bad/Dockerfile.naive-node node-app
docker images --filter 'reference=bookcheck-deploygo-*'
docker network create bookcheck-deploygo-net
docker run -d --name bookcheck-deploygo-go --network bookcheck-deploygo-net bookcheck-deploygo-go:1.0
docker inspect -f '{{.State.Health.Status}}' bookcheck-deploygo-go      # healthy after ~15 s
docker rm -f bookcheck-deploygo-go

# 2. Graceful shutdown (chapter 2): SIGTERM while a 6 s request is in flight
bash shutdown-test.sh bookcheck-deploygo-go:1.0
bash shutdown-test.sh bookcheck-deploygo-node:1.0
bash shutdown-test.sh bookcheck-deploygo-naive-node:1.0                  # control with npm start: the request is cut off
docker network rm bookcheck-deploygo-net

# 3. Lint and scan
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

# 4. Compose (chapter 3)
docker compose up -d --build && docker compose --profile test run --rm tests
docker compose --profile test down -v

# 5. PostgreSQL lock lab (chapter 7); removes its own containers
bash migration/run.sh                          # full run (a few minutes, ~2 million rows)
ROWS=300000 ONLY=EFG bash migration/run.sh     # parts E-G only, lighter
```

Summary of the results from the runs:

- Images: Go multi-stage `distroless/static` **17 MB** (naive `golang` version **1.44 GB**); Node `node:26-slim` multi-stage **353 MB** (naive `node:26` version **1.85 GB**). Both are `healthy` and run as non-root (uid 65532 and 1000).
- Graceful shutdown: SIGTERM while a 6 s request is in flight; both Go and Node return `200` and then exit with code 0; the `CMD ["npm", "start"]` version cuts the request off (`UND_ERR_SOCKET`).
- hadolint: the two good Dockerfiles pass; the bad Go Dockerfile has 5 warnings (DL3007, DL3008, DL3009, DL3015, DL3003), the Node version adds DL3025.
- Trivy 0.76.0: the Go image has 0 HIGH/CRITICAL; the Node image has 48 HIGH (Debian packages) + 6 HIGH (npm packages inside `npm` itself), 0 CRITICAL.
- actionlint: `ci.yml` (Go + Node) is clean; `bad.yml` has 2 errors (untrusted input, expression syntax).
- kubeconform: `app.yaml` 7/7 valid; `broken.yaml` is caught (wrong type).
- PostgreSQL 18.6: a plain `CREATE INDEX` blocks INSERT for 5.2 s; `CONCURRENTLY` does not wait on a lock (167 ms worst case due to resource contention); `ALTER COLUMN TYPE bigint` blocks INSERT for 20.1 s under `AccessExclusiveLock` (the migration lab figures are kept from the earlier run; only the container name prefix changed).
- Not run: a real Kubernetes cluster (manifests were only validated), MySQL online DDL, cosign, Argo CD/Flux/Helm, a real blue-green.

## Further reading

1. Jez Humble, David Farley, *Continuous Delivery* (Addison-Wesley, 2010): the foundation of the deployment pipeline.
2. Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* (IT Revolution, 2018): the four DORA metrics and the statistical evidence.
3. Kubernetes docs: kubernetes.io/docs (Concepts, Workloads, Configure Liveness, Readiness and Startup Probes).
4. Docker docs: "Building best practices" and "Multi-stage builds" (docs.docker.com).
5. GitHub Docs: "Security hardening for GitHub Actions" and "OpenID Connect".
6. PostgreSQL docs: "Explicit Locking" (chapter 13) and `CREATE INDEX` (section Building Indexes Concurrently); the README of `strong_migrations` (Andrew Kane) on dangerous migration operations.
