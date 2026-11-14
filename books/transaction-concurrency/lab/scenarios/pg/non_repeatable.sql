-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal FROM acct WHERE id=1 \gset a1_
SELECT pg_sleep(5);
SELECT bal FROM acct WHERE id=1 \gset a2_
COMMIT;
SELECT 'A đọc lần 1 / lần 2', :a1_bal, :a2_bal;
SELECT CASE WHEN :a1_bal<>:a2_bal THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END;
-- @b
SELECT pg_sleep(2);
UPDATE acct SET bal=999 WHERE id=1;
