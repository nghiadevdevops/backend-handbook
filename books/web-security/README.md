# Web Application Security

A study guide written in Vietnamese in November 2026 for TypeScript/Node.js backend developers (SQL, REST APIs) who already know the basics of system design and API design. The running example is a small bookshop (`Book`, `Order`, `User`, `Comment`).

## Who this book is for

- You have already written a Node.js/TypeScript API (Express or similar) and know SQL, HTTP and basic cookies.
- You know Docker well enough to run a container (needed for the labs).
- No prior security knowledge is required.

## Contents

1. [Chapter 1. Security Mindset: threat modeling, defense in depth](01-security-mindset.md)
2. [Chapter 2. OWASP Top 10 (2025) and ASVS](02-owasp-top10-and-asvs.md)
3. [Chapter 3. Injection: SQL, command, NoSQL, template](03-injection.md)
4. [Chapter 4. XSS, CSP and Trusted Types](04-xss-csp.md)
5. [Chapter 5. CSRF and Cookies](05-csrf-and-cookies.md)
6. [Chapter 6. Authentication: passwords, MFA, passkeys](06-authentication.md)
7. [Chapter 7. Sessions and JWT](07-sessions-and-jwt.md)
8. [Chapter 8. OAuth 2.0 and OpenID Connect for Developers](08-oauth-oidc.md)
9. [Chapter 9. Authorization: RBAC/ABAC/ReBAC, IDOR/BOLA](09-authorization.md)
10. [Chapter 10. SSRF, Path Traversal, Upload, Deserialization, Mass Assignment, Prototype Pollution](10-ssrf-upload-deserialization.md)
11. [Chapter 11. Secrets, Configuration, Security Headers and TLS](11-secrets-header-tls.md)
12. [Chapter 12. Software Supply Chain: npm audit, lockfile, provenance, SBOM, Sigstore, SLSA](12-supply-chain.md)
13. [Chapter 13. Security Logging and Incident Response](13-logging-and-incident-response.md)

Lab: [`lab/`](lab/) and the real run results: [`lab/KET-QUA.md`](lab/KET-QUA.md).

## Versions

Used or checked on 2026-11-08.

| Item | Version / status | How verified |
|---|---|---|
| OWASP Top 10 | **2025** (A01 Broken Access Control ... A10 Mishandling of Exceptional Conditions) | page `top10.owasp.org/2025` |
| OWASP ASVS | **5.0.0**, stable, 2025-05-30, 17 chapters | `asvs.owasp.org`, repo directory tree |
| OWASP Password Storage | Argon2id m=19 MiB, t=2, p=1; bcrypt cost >= 10 | cheat sheet, read |
| OAuth 2.1 | Still an Internet-Draft (draft-ietf-oauth-v2-1, revision -14/-15 in 2026) | search; not confirmed directly from the datatracker |
| SLSA | v1.2 | `slsa.dev/spec` |
| cosign | 3.x line (3.1.x per the distribution package) | indirect, not verified from upstream |
| Lab: Node.js | **v26.13.0** (image `node:lts-alpine`, the LTS line as of 2026-11-08) | `node -v` in the container |
| Lab: npm | 11.20.0 | `npm -v` in the container |
| Lab: Express | **5.3.0** (Express 5 chosen, reasons below) | `npm view express version`, `package-lock.json` |
| Lab: pg / helmet / zod | 8.23.1 / 8.3.0 / 4.6.7 | `npm view`, `package-lock.json` |
| Snippets: argon2 / jose / undici / pino | 0.45.2 / 6.2.15 / 8.12.4 / 10.4.0 | `npm view`, run in `lab/snippets` |
| Lab: PostgreSQL | 18 (image `postgres:18`) | image available locally |
| TypeScript | 7.0.2 is `latest` on npm (`npm view typescript`); the lab does **not** use `tsc`, Node 26 runs `.ts` files directly (type stripping), so there is no type-check step in the lab | `npm view typescript dist-tags` |
| Lab: Docker | 29.8.1 | `docker --version` |

Every unverified claim is explicitly marked "chưa xác minh" (not verified) in place in the chapters. Any code that was not run in the lab is likewise marked "chưa chạy trong lab" (not run in the lab) in place; code that cites a source file in `lab/` was actually run. Library option names can change between major versions, so check the README of the exact version you install.

## Running the labs

Requirement: Docker. You do not need to install Node.js, npm or PostgreSQL on your machine. The lab uses only containers, with networks prefixed `bookcheck-sec-`, **no ports mapped to the host**, and cleans up after itself.

```bash
cd lab
bash run.sh                                   # Git Bash / Linux / macOS; takes a few minutes (each curl call is a docker run)
# demo the code snippets from chapters 6, 7, 10, 13 (argon2, jose, SSRF defense, pino):
docker run --rm --memory 512m -v "$PWD/snippets:/snippets:ro" node:lts-alpine sh /snippets/run.sh
```

(On Git Bash/Windows, add `MSYS_NO_PATHCONV=1` and use `$(pwd -W)` instead of `$PWD`, as in `run.sh`.)

The `run.sh` script creates the network `bookcheck-sec-net`, runs `bookcheck-sec-db` (`postgres:18`) and `bookcheck-sec-app` (`node:lts-alpine`; `app/start.sh` copies `lab/app` to `/srv`, runs `npm ci --omit=dev` from `package-lock.json`, then `node server.ts`), attacks it with `curl` from a `curlimages/curl` container on the same network, then runs `npm audit` on `lab/audit/package.json` (see `lab/audit/audit.sh`). Each vulnerability has a pair of endpoints, `/vuln/...` (deliberately flawed) and `/fixed/...`: SQL injection, stored XSS (with CSP), IDOR, mass assignment, prototype pollution. `run.sh` has a `trap` that removes the containers and network. The `lab/app` directory is mounted read-only, so `node_modules` lives inside the container and nothing is left on the host. If you change dependencies, regenerate the lockfile with `lab/app/lock.sh` (run in a container, with `lab/app` mounted writable).

**Why Express 5 and not Fastify.** Both are fine and still maintained (Fastify 5.12.8 as of 2026-11-08). The lab picks Express 5.3.0 because (1) it is the framework most Node developers already know, so the vulnerable and fixed code is easiest to read; (2) Express 5 forwards errors from `async` handlers to the error-handling middleware, so there is no need to wrap every handler in try/catch; (3) the security middleware ecosystem (helmet, `express-session`, `express-rate-limit`) is documented around Express. The techniques in the book (parameterized queries, schema validation, CSP, policies) do not depend on the framework; with Fastify, replace `zod` with the built-in JSON Schema and use `@fastify/helmet`.

**Why run `.ts` directly.** Node 26 runs TypeScript files by type stripping (it only removes types and does not check them), so the lab has no build step and needs no `tsx`/`ts-node`. Consequence: only "erasable" syntax is used (no `enum`, no parameter properties), and the lab does **not** run `tsc`, meaning types were not checked in this run. A real project should add `tsc --noEmit` to CI.

**For learning on your own machine only.** The application in `lab/app` is deliberately vulnerable and must never be deployed. Do not scan or attack systems you do not own.

Optional (not done in this book): a ZAP baseline scan (`ghcr.io/zaproxy/zaproxy:stable`, `zap-baseline.py -t http://bookcheck-sec-app:8080`) aimed at the lab container on the same network. The image is fairly heavy, so it was skipped.

## Further reading

- OWASP Cheat Sheet Series (`cheatsheetseries.owasp.org`): concrete implementation guidance for each topic, and the main reference source for this book.
- OWASP ASVS 5.0 (`asvs.owasp.org`) and OWASP Top 10:2025 (`top10.owasp.org/2025`).
- PortSwigger Web Security Academy (`portswigger.net/web-security`): free, hands-on attack labs in the browser for SQLi, XSS, CSRF, SSRF, JWT, OAuth...
- Andrew Hoffman, *Web Application Security* (O'Reilly): an overview of attacks and defenses.
- Tanya Janca, *Alice and Bob Learn Application Security* (Wiley): security processes across the development lifecycle, easy to read.
- Express docs (`expressjs.com`, Security best practices section) and helmet (`helmetjs.github.io`); the READMEs of `jose`, `openid-client`, `argon2`, `zod` for chapters 6-8 and 10.
