-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100);
-- @a
BEGIN; UPDATE acct SET bal=0 WHERE id=1; SELECT pg_sleep(4); ROLLBACK;
-- @b
SELECT pg_sleep(2);
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal FROM acct WHERE id=1 \gset b_
SELECT 'B đọc được', :b_bal;
COMMIT;
SELECT CASE WHEN :b_bal=0 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END;
