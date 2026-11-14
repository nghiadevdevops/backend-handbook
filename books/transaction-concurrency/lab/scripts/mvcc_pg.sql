-- Chạy: docker exec -i bookcheck-txn-pg psql -U postgres -d lab -X -f - < scripts/mvcc_pg.sql
DROP TABLE IF EXISTS mv; CREATE TABLE mv(id int PRIMARY KEY, v int) WITH (autovacuum_enabled = off);
INSERT INTO mv SELECT g, 0 FROM generate_series(1,1000) g;
\echo '--- 1) xmin/xmax/ctid của một dòng'
SELECT ctid, xmin, xmax, * FROM mv WHERE id=1;
UPDATE mv SET v=1 WHERE id=1;
SELECT ctid, xmin, xmax, * FROM mv WHERE id=1;
\echo '--- 2) bloat sau khi UPDATE toàn bảng 5 lần (autovacuum tắt)'
SELECT pg_size_pretty(pg_relation_size('mv')) AS size_truoc;
UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1;
SELECT pg_size_pretty(pg_relation_size('mv')) AS size_sau_update;
SELECT pg_stat_force_next_flush();
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname='mv';
VACUUM mv;
SELECT pg_size_pretty(pg_relation_size('mv')) AS size_sau_vacuum;
SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relname='mv';
