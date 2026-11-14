-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100),(2,100);
-- @a
BEGIN; UPDATE acct SET bal=bal+1 WHERE id=1;
SELECT pg_sleep(4);
SELECT 'pg_locks', l.locktype, coalesce(l.relation::regclass::text, l.transactionid::text) AS target, l.mode, l.granted, l.pid = pg_backend_pid() AS is_a
  FROM pg_locks l WHERE l.locktype IN ('relation','transactionid','tuple') AND (l.relation IS NULL OR l.relation='acct'::regclass) AND l.pid <> pg_backend_pid() OR l.pid = pg_backend_pid() AND l.locktype IN ('relation','transactionid','tuple') AND (l.relation IS NULL OR l.relation='acct'::regclass) ORDER BY l.locktype, l.pid = pg_backend_pid() DESC;
SELECT 'blocking', pid, pg_blocking_pids(pid) AS blocked_by, wait_event_type, wait_event, left(query,40) FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0;
COMMIT;
-- @b
SELECT pg_sleep(1.5);
BEGIN; SET lock_timeout='6s'; UPDATE acct SET bal=bal+1 WHERE id=1; COMMIT;
-- @final
SELECT 'ANOMALY:no';
