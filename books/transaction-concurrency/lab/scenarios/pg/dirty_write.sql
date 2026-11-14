-- @setup
DROP TABLE IF EXISTS listing; CREATE TABLE listing(id int PRIMARY KEY, buyer text);
INSERT INTO listing VALUES (1,'none'),(2,'none');
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE listing SET buyer='A' WHERE id=1;
SELECT pg_sleep(4);
UPDATE listing SET buyer='A' WHERE id=2;
COMMIT;
-- @b
SELECT pg_sleep(2);
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE listing SET buyer='B' WHERE id=1;
UPDATE listing SET buyer='B' WHERE id=2;
COMMIT;
-- @final
SELECT CASE WHEN count(DISTINCT buyer)>1 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM listing;
SELECT 'owner', id, buyer FROM listing ORDER BY id;
