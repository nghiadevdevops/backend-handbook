-- @setup
DROP TABLE IF EXISTS items; CREATE TABLE items(id serial PRIMARY KEY, cat text, flag int DEFAULT 0);
INSERT INTO items(cat) VALUES ('x'),('x'),('y');
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT count(*) AS n FROM items WHERE cat='x' \gset a1_
SELECT pg_sleep(5);
SELECT count(*) AS n FROM items WHERE cat='x' \gset a2_
COMMIT;
SELECT 'A đếm lần 1 / lần 2', :a1_n, :a2_n;
SELECT CASE WHEN :a1_n<>:a2_n THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END;
-- @b
SELECT pg_sleep(2);
INSERT INTO items(cat) VALUES ('x');
