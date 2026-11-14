-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100),(2,100);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE acct SET bal=bal-10 WHERE id=1;
SELECT pg_sleep(3);
UPDATE acct SET bal=bal+10 WHERE id=2;
COMMIT;
-- @b
SELECT pg_sleep(1);
BEGIN ISOLATION LEVEL __LEVEL__;
UPDATE acct SET bal=bal-10 WHERE id=2;
SELECT pg_sleep(3);
UPDATE acct SET bal=bal+10 WHERE id=1;
COMMIT;
-- @final
SELECT 'tổng tiền (kỳ vọng 200)', sum(bal) FROM acct;
SELECT 'ANOMALY:no';
