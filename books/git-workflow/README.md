# Git Workflow & Branching Strategies

A study guide for TypeScript/Node.js and Go developers who use git every day (commit, push, pull) but are not yet confident about working as a team: branching strategies, pull requests, releases, and troubleshooting. The running example is a small order system (`orders`), with a Go service and a TypeScript package. The lecture text of the chapters is written in Vietnamese.

## Who this book is for
- Backend or fullstack developers who are new to a team, or who have just been asked to set up the team's process.
- Tech leads who need to choose a workflow (Git Flow, GitHub Flow, trunk-based) and configure the repo with good reasons.

## Prerequisites
- Basic use of `git add/commit/push/pull/branch/merge`.
- Docker at the level of running `docker run` (to run the labs).
- Basic ability to read TypeScript and Go.

## Contents
1. [The Git Data Model, at a Practical Level](01-git-data-model.md)
2. [Merge, Rebase, Squash](02-merge-rebase-squash.md)
3. [Git Flow](03-git-flow.md)
4. [GitHub Flow and GitLab Flow](04-github-flow-gitlab-flow.md)
5. [Trunk-Based Development](05-trunk-based-development.md)
6. [Comparing and Choosing a Workflow](06-choosing-a-workflow.md)
7. [Good Commits](07-good-commits.md)
8. [Pull Requests and Code Review](08-pull-requests-and-review.md)
9. [Versioning and Release](09-versioning-and-release.md)
10. [Monorepo](10-monorepo.md)
11. [Troubleshooting and Data Recovery](11-troubleshooting-and-recovery.md)
12. [Protecting the Repo](12-protecting-the-repo.md)
13. [Team Checklist](13-team-checklist.md)

Lab: [lab/README.md](lab/README.md).

## Versions used or checked (checked 2026-11-09)

| Component | Version | Source |
|---|---|---|
| Git (upstream) | 2.56.0 (2026-09-28); **Git 3.0 not yet released** | git-scm.com, `git-scm.com/docs/BreakingChanges` |
| Git in the lab (`node:lts`, Debian) | 2.47.3 | actually run |
| Git 3.0 expected | `main` as default, SHA-256 as default, reftable as default, Rust required, `safe.bareRepository=explicit`, removal of `whatchanged`, `pack-redundant`, grafts | BreakingChanges (read) |
| Git Flow (Driessen) | 2010 post, March 2020 note recommends a simpler workflow for continuous delivery | nvie.com |
| git-flow-avh | archived, last release 1.12.3 (2019-05) | GitHub API |
| git-flow-next (gittower) | v2.1.0 (2026-09-08) | GitHub API |
| Conventional Commits | 1.0.0 | conventionalcommits.org |
| semantic-release | v25.0.9 (2026-08) | GitHub releases |
| release-please | v17.11.2 (2026-08) | GitHub releases |
| changesets | `@changesets/cli` 3.0.3 (2026-09) | GitHub releases |
| GoReleaser | v2.20.0 (2026-11-04) | GitHub releases |
| husky | 9.1.7 | npm registry |
| lefthook | v2.2.2 (2026-10) | GitHub releases, actually run |
| commitlint | `@commitlint/cli` 21.2.4 (actually run) | npm |
| gitsign | v0.18.0 (2026-10) | GitHub releases |
| git-filter-repo | v2.47.0 (2024-12) | GitHub releases |
| Docker | 29.8.1 | host |

Not verified: the GA status of GitHub stacked pull requests (sources conflict), SHA-256 support on GitHub, versions of the GitHub Actions used in the monorepo examples, details of npm trusted publishing, the procedure for purging GitHub's cached views, and the gitleaks version.

## Running the labs
All git commands run in Docker (`node:lts`); see [lab/README.md](lab/README.md). Example:

```sh
cd lab
MSYS_NO_PATHCONV=1 timeout 600 docker run --rm --name bookcheck-git-a \
  -v "$(pwd):/work:ro" node:lts sh /work/scripts/a-git-flow.sh
```

## Further reading
- Scott Chacon, Ben Straub, *Pro Git* (free at https://git-scm.com/book): the fundamentals, especially the chapters on branching and Git internals.
- Vincent Driessen, "A successful Git branching model" (https://nvie.com/posts/a-successful-git-branching-model/), with the 2020 note.
- Paul Hammant, https://trunkbaseddevelopment.com: trunk-based development, branch by abstraction, release from trunk.
- Nicole Forsgren, Jez Humble, Gene Kim, *Accelerate* (IT Revolution, 2018): the research behind the DORA metrics.
- https://www.conventionalcommits.org and https://semver.org: two short specs worth reading in full.
- GitHub docs on rulesets and merge queue (docs.github.com, section Repositories > Configuring branches and merges).
