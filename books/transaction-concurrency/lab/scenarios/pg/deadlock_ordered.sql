-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int); INSERT INTO acct VALUES (1,100),(2,100);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT id FROM acct WHERE id IN (1,2) ORDER BY id FOR UPDATE;
SELECT pg_sleep(3);
UPDATE acct SET bal=bal-10 WHERE id=1;
UPDATE acct SET bal=bal+10 WHERE id=2;
COMMIT;
-- @b
SELECT pg_sleep(1);
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT id FROM acct WHERE id IN (1,2) ORDER BY id FOR UPDATE;
UPDATE acct SET bal=bal-10 WHERE id=2;
UPDATE acct SET bal=bal+10 WHERE id=1;
COMMIT;
-- @final
SELECT 'tổng tiền (kỳ vọng 200)', sum(bal) FROM acct;
SELECT CASE WHEN sum(bal)=200 THEN 'ANOMALY:no' ELSE 'ANOMALY:yes' END FROM acct;
