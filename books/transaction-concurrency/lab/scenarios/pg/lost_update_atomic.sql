-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int, ver int DEFAULT 0); INSERT INTO acct VALUES (1,100,0);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE acct SET bal = bal + 10 WHERE id=1;
SELECT pg_sleep(4);
COMMIT;
-- @b
SELECT pg_sleep(2);
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE acct SET bal = bal + 20 WHERE id=1;
COMMIT;
-- @final
SELECT 'số dư cuối (kỳ vọng 130)', bal FROM acct WHERE id=1;
SELECT CASE WHEN bal<>130 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM acct;
