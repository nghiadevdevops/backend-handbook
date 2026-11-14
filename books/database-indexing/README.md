# Database Indexing

A rewrite in new wording, following the topic outline of the ebook "Database Indexing & What Developers Need to Know", for self-study. The content was verified by actually running it on PostgreSQL and MySQL in Docker; where the real result differed from what was about to be written, the text follows the real result. The lecture text of the chapters is written in Vietnamese.

## Versions used and tested

Output of `SELECT version()`:

| DB | `version()` | Notes |
|---|---|---|
| PostgreSQL | `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit` | image `postgres:latest`, database collation `en_US.utf8` |
| PostgreSQL + PostGIS | PostgreSQL 18.6, PostGIS 3.7.0 | image `postgis/postgis:latest`, used only in chapter 8 (section 8.3) |
| MySQL | `9.7.4` | image `mysql:lts`, InnoDB engine, collation `utf8mb4_0900_ai_ci` |

Version status as of 2026-11-07 (checked on postgresql.org and dev.mysql.com, not from memory):

- **PostgreSQL**: 18 is the latest major release, released 2025-09-25, current patch release 18.6. Versions 17.11, 16.15, and 15.19 are still supported; 14 reaches end of support on 2026-11-12. PostgreSQL 19 is at the **release candidate** stage (RC 1 on 2026-10-15) and not yet officially released; the book mentions 19 only as unconfirmed information and has not tested it.
- **MySQL**: there are two tracks, LTS and Innovation. 9.7 is an LTS release (9.7.0 released 2026-04-21, latest is 9.7.4 on 2026-10-20); 8.4 is also an LTS line. The MySQL documentation says 9.7 is the last release with sequential numbering; after that, calendar-based numbering is used (for example "26.7" is the July 2026 release). I **could not confirm** the version number of the latest Innovation release or the exact release date of each 26.x release; the book only tested 9.7.4.
- Index/optimizer-related features that were verified: multicolumn B-tree skip scan (PostgreSQL 18), built-in `uuidv7()` (PostgreSQL 18), `Index Searches` in `EXPLAIN` (PostgreSQL 18), Skip Scan range access (MySQL 8.0.13+), `EXPLAIN ANALYZE` (MySQL 8.0.18+), `EXPLAIN` defaulting to TREE format (observed on 9.7.4), the hypergraph optimizer included in the Community edition since 9.7 (enabled with `optimizer_switch='hypergraph_optimizer=on'`, per the release notes, not tried), MD5()/SHA()/SHA1() no longer built in from MySQL 9.6 (tried on 9.7.4).

## Contents

1. [Fundamentals: What an Index Is, How a B-tree Works, How Tables Are Stored](01-index-fundamentals-and-storage.md)
2. [Multicolumn Indexes: Four Rules and Skip Scan](02-multicolumn-index-four-rules.md)
3. [Operators, NULL, LIKE, Wrapped Columns and Data Types: When an Index Can Be Used](03-operators-null-like-functions-types.md)
4. [ORDER BY, GROUP BY, DISTINCT, JOIN, Subqueries, UPDATE/DELETE](04-order-by-group-by-distinct-join.md)
5. [Optimizer, EXPLAIN and Statistics: Why the Database Doesn't Use Your Index (or Uses It Wrongly)](05-optimizer-explain-statistics.md)
6. [Covering Indexes and Index-Only Scans: Queries That Never Touch the Table](06-covering-index-index-only-scan.md)
7. [Advanced Index Techniques: Expression, Partial Index, Low-Cardinality Columns, "Ghost" Conditions, Size Limits, Unique and NULL](07-advanced-index-techniques.md)
8. [Indexes for JSON, Full-Text Search, Spatial Data and Exclusion Constraints](08-json-full-text-spatial-exclusion.md)
9. [Write Cost, Index Maintenance and Dropping Unused Indexes](09-write-cost-maintenance-unused-indexes.md)
10. [Query Techniques: Keyset Pagination, Upsert, Row Locks, Counters, Deduplication, CTEs](10-query-techniques-pagination-locking-upsert-cte.md)
11. [Schema Design: Primary Keys, UUIDs, Partitioning, Pre-Sorting and Precomputation](11-schema-design-uuid-partition-precomputation.md)

## How to read

- Study chapters 1 to 6 first, in order: that is the core (B-tree, column order, which conditions can use an index, reading plans). Chapters 7 to 11 are supplementary techniques; read them as needed.
- Each chapter has: explanation, examples (schema, query, abbreviated EXPLAIN), pitfalls, summary, self-check questions. **Answers are in a `<details>` block at the end of each chapter**: try answering before opening it.
- Every SQL block is labeled `-- PostgreSQL`, `-- MySQL`, or `-- both` on its first line. Syntax specific to one DB must not be mixed: for example `DISTINCT ON`, `UPDATE ... FROM`, `RETURNING`, `ALTER TABLE ... DETACH PARTITION` are PostgreSQL; `IF()`, `ALTER TABLE ... DROP PARTITION`, `UPDATE ... JOIN`, `INSERT IGNORE` are MySQL.
- Timing figures (ms) are only for relative comparison on a test machine with small data that fits entirely in RAM; do not use them as absolute factors.
- Plans are abbreviated, with `Planning` and `Buffers` lines dropped when not needed.
- Test data: `users` with 300,000 rows, `orders` with about 500,000 rows, generated with `generate_series` (PostgreSQL) and a recursive CTE (MySQL). The scripts live outside this folder, in the test folder of the working session.

## Examples not tested or uncertain

- Everything about PostgreSQL 19 (RC) and the MySQL hypergraph optimizer: based on release notes only.
- The comparison table of functional indexes in other systems (MariaDB, SQL Server, Oracle, SQLite): based on documentation, not run.
- InnoDB implementation details of visibility checks with covering indexes (chapter 6): not measured.
- The cause of MySQL's misestimate for `status = 'active'` despite having a histogram (chapter 5): not determined.
- `EXPLAIN ANALYZE` with multi-table `UPDATE`/`DELETE` on MySQL: the test results were not clear enough to conclude.
- "Skip scan only for covering queries" in MySQL: true in the example tried (SELECT * did not use skip scan); see the MySQL documentation for the full conditions.
- The exact relationship between `Index Searches: 11` and the number of status values (5) in chapter 2: only stated as "many searches".
