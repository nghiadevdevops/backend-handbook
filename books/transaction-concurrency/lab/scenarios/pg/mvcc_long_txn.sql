-- @setup
DROP TABLE IF EXISTS mv; CREATE TABLE mv(id int PRIMARY KEY, v int) WITH (autovacuum_enabled = off);
INSERT INTO mv SELECT g, 0 FROM generate_series(1,1000) g;
-- @a
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT 'A giữ snapshot, count =', count(*) FROM mv;
SELECT pg_sleep(8);
COMMIT;
-- @b
SELECT pg_sleep(2);
UPDATE mv SET v=v+1;
SELECT 'B: VACUUM khi A còn mở';
VACUUM (VERBOSE) mv;
SELECT pg_sleep(8);
SELECT 'B: VACUUM sau khi A đã commit';
VACUUM (VERBOSE) mv;
