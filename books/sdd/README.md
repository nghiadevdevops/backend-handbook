# Spec-Driven Development

A self-written study edition, in Vietnamese, on Spec-Driven Development (SDD) with AI coding agents. The running example project is **RoomBook**, an internal meeting-room booking system. The content is based on the tools' official documentation as of 07/11/2026 and is not copied from the original book.

## Who this book is for
Working developers who have already used AI coding agents (Claude Code, Copilot...) and want to work in a controlled way instead of "vibe coding", or who are evaluating an SDD tool for their team.

## Prerequisites
Basic Git, the ability to read TypeScript (the lab uses TypeScript 5.9 on Node.js, tested with `node:test`), and the concept of automated tests. No prior DDD knowledge is needed (chapter 3 explains it).

## Contents
1. [Chapter 1. Vibe coding, and why the spec is back at the center](01-vibe-coding-vs-sdd.md)
2. [Chapter 2. The four layers of a requirement: BR, Use Case, Entity, Acceptance Criteria](02-four-requirement-layers.md)
3. [Chapter 3. DDD and Hexagonal Architecture in the AI era](03-ddd-and-hexagonal.md)
4. [Chapter 4. Six principles of working spec-first](04-six-principles.md)
5. [Chapter 5. Claude Code as a platform for SDD](05-claude-code-for-sdd.md)
6. [Chapter 6. SDD tools: Spec Kit, OpenSpec, Kiro, AIUP, and DIY](06-sdd-tools-comparison.md)
7. [Chapter 7. Greenfield: building RoomBook from scratch](07-greenfield.md)
8. [Chapter 8. Brownfield: applying SDD to an existing system](08-brownfield.md)
9. [Chapter 9. Running a Spec-Driven team day to day](09-team-operations.md)
10. [Chapter 10. When not to use SDD, and where to go next](10-when-not-to-use-sdd.md)

Appendices: [A. BR, UC, Entity, AC templates](appendix-a-templates.md) · [B. PR template and git conventions](appendix-b-pr-template-and-git.md) · [C. Command cheatsheet](appendix-c-command-cheatsheet.md) · [D. Glossary](appendix-d-glossary.md)

## Versions and verification date (07/11/2026)

| Item | Version / status | Source |
|---|---|---|
| GitHub Spec Kit | v1.3.2 (released 06/11/2026); Python 3.11+, `uv` | GitHub Releases API, README, `docs/quickstart.md`, `docs/integrations/claude.md` |
| OpenSpec | v1.16.1 (07/11/2026); Node.js 22.12.0+ when installed via a package manager | GitHub Releases API, README, `docs/commands.md`, `concepts.md`, `customization.md`, `installation.md` |
| AIUP `aiup-core` | 3.13.0 (per the Tessl registry; GitHub tag not cross-checked) | marketplace `ai-unified-process/marketplace`, Tessl page |
| Kiro | `kiro.dev/docs` documentation (specs, steering, hooks); no version number given | kiro.dev |
| Claude Code | `code.claude.com/docs` documentation read on 07/11/2026 (CLI version number not checked) | memory, sub-agents, skills, hooks, plugins, common-workflows |
| TypeScript and Node.js (lab) | `node:lts` (run with Node.js v26.13.0, TS executed directly via type stripping, requires Node 22.18 or later), TypeScript 5.9.x, `@types/node` 24; tests use the built-in `node:test`, no extra test framework | Actually run in Docker |
| git (command trials) | 2.47.3 in the `ruby:3.3` image | |

Points **not yet verified** (stated clearly in the relevant chapters): the current feature directory layout of Spec Kit v1.3.2; the `.kiro/specs/` path from an official source; the namespaced form of invoking an AIUP skill in Claude Code; the "six principles" are not AIUP's according to the documentation I could read.

## Running the labs
The lab lives in `lab/roombook/`. Nothing is installed on your machine; everything runs in Docker. Structure: `specs/`, `src/` (`domain`, `application`, `ports`, `adapters`), `tests/acceptance/`.

Check traceability, that every AC has a test (only `sh` and `grep` needed):

```bash
cd lab/roombook
docker run --rm -v "$PWD:/w:ro" -w /w node:lts sh scripts/check-ac-coverage.sh
```

Run typecheck, the 13 acceptance tests (`node:test`) and AC coverage in one go. Actually run in Docker (Node.js v26.13.0): `tsc --noEmit` passes, 13/13 tests pass, 13/13 ACs have tests. The mount is writable because `npm install` creates `node_modules` (delete it after the run):

```bash
docker run --rm -v "$PWD:/w" -w /w node:lts sh scripts/verify.sh
```

On Windows Git Bash, prefix `docker` with `MSYS_NO_PATHCONV=1` if paths get rewritten.

## Further reading (verified to exist)
- Den Delimarsky, "Spec-driven development with AI: Get started with a new open source toolkit", GitHub Blog, 02/09/2025.
- Den Delimarsky, "Diving Into Spec-Driven Development With GitHub Spec Kit", Microsoft Developer Blog, 15/09/2025 (a single blog post).
- Documentation for Spec Kit (`github.com/github/spec-kit`), OpenSpec (`github.com/Fission-AI/OpenSpec`), Kiro (`kiro.dev/docs`), Claude Code (`code.claude.com/docs`).
- Eric Evans, *Domain-Driven Design* (2003). Alistair Cockburn, "Hexagonal architecture" (article, circa 2005).
