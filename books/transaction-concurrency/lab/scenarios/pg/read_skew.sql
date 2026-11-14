-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,50),(2,50);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal AS v FROM acct WHERE id=1 \gset a1_
SELECT pg_sleep(5);
SELECT bal AS v FROM acct WHERE id=2 \gset a2_
COMMIT;
SELECT 'A thấy acct1, acct2, tổng', :a1_v, :a2_v, :a1_v+:a2_v;
SELECT CASE WHEN :a1_v+:a2_v<>100 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END;
-- @b
SELECT pg_sleep(2);
BEGIN;
UPDATE acct SET bal=bal-50 WHERE id=1;
UPDATE acct SET bal=bal+50 WHERE id=2;
COMMIT;
