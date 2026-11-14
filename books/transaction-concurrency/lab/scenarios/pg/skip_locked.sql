-- @setup
DROP TABLE IF EXISTS jobs; CREATE TABLE jobs(id serial PRIMARY KEY, state text NOT NULL DEFAULT 'new', worker text);
INSERT INTO jobs(state) SELECT 'new' FROM generate_series(1,6);
-- @a
BEGIN;
WITH c AS (SELECT id FROM jobs WHERE state='new' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED)
UPDATE jobs j SET state='running', worker='A' FROM c WHERE j.id=c.id RETURNING 'A nhận job', j.id;
SELECT pg_sleep(4);
COMMIT;
-- @b
SELECT pg_sleep(2);
BEGIN;
WITH c AS (SELECT id FROM jobs WHERE state='new' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED)
UPDATE jobs j SET state='running', worker='B' FROM c WHERE j.id=c.id RETURNING 'B nhận job', j.id;
COMMIT;
-- @final
SELECT id, state, worker FROM jobs ORDER BY id;
SELECT CASE WHEN count(*) FILTER (WHERE state='running')=4 THEN 'ANOMALY:no' ELSE 'ANOMALY:yes' END FROM jobs;
