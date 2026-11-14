-- @setup
DROP TABLE IF EXISTS jobs; CREATE TABLE jobs(id serial PRIMARY KEY, state text NOT NULL DEFAULT 'new');
INSERT INTO jobs(state) SELECT 'new' FROM generate_series(1,3);
-- @a
BEGIN; SELECT id FROM jobs WHERE id=1 FOR UPDATE; SELECT pg_sleep(4); COMMIT;
-- @b
SELECT pg_sleep(2);
BEGIN; SELECT id FROM jobs WHERE id=1 FOR UPDATE NOWAIT; ROLLBACK;
SELECT 'ANOMALY:no';
