-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100);
-- @a
BEGIN; UPDATE acct SET bal=bal+1 WHERE id=1; SELECT pg_sleep(5); COMMIT;
-- @b
SELECT pg_sleep(1.5);
SET lock_timeout = '1s';
UPDATE acct SET bal=bal+1 WHERE id=1;
SELECT 'ANOMALY:no';
