-- @setup
DROP TABLE IF EXISTS child, parent; CREATE TABLE parent(id int PRIMARY KEY, name text);
CREATE TABLE child(id serial PRIMARY KEY, parent_id int REFERENCES parent(id));
INSERT INTO parent VALUES (1,'p1');
-- @a
BEGIN;
SELECT id FROM parent WHERE id=1 FOR UPDATE;
SELECT pg_sleep(4);
COMMIT;
-- @b
SELECT pg_sleep(1.5);
SET lock_timeout='1s';
INSERT INTO child(parent_id) VALUES (1);
SELECT 'ANOMALY:no';
