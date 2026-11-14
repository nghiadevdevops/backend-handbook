-- @setup
DROP TABLE IF EXISTS child, parent; CREATE TABLE parent(id int PRIMARY KEY, name text);
CREATE TABLE child(id serial PRIMARY KEY, parent_id int REFERENCES parent(id));
INSERT INTO parent VALUES (1,'p1');
-- @a
BEGIN;
UPDATE parent SET name='doi ten' WHERE id=1;
SELECT pg_sleep(4);
COMMIT;
-- @b
SELECT pg_sleep(1.5);
SET lock_timeout='1s';
INSERT INTO child(parent_id) VALUES (1);
SELECT 'B insert child xong, khong phai cho';
SELECT 'ANOMALY:no';
