-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int, ver int DEFAULT 0); INSERT INTO acct VALUES (1,100,0);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal FROM acct WHERE id=1 \gset a_
SELECT pg_sleep(5);
UPDATE acct SET bal = :a_bal + 10 WHERE id=1;
COMMIT;
-- @b
SELECT pg_sleep(1.5);
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal FROM acct WHERE id=1 \gset b_
SELECT pg_sleep(1);
UPDATE acct SET bal = :b_bal + 20 WHERE id=1;
COMMIT;
-- @final
SELECT 'số dư cuối (kỳ vọng 130)', bal FROM acct WHERE id=1;
SELECT CASE WHEN bal<>130 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM acct;
