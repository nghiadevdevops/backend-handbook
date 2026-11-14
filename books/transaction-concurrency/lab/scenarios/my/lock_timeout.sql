-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id INT PRIMARY KEY, bal INT) ENGINE=InnoDB; INSERT INTO acct VALUES (1,100),(2,100);
-- @a
START TRANSACTION; UPDATE acct SET bal=bal+1 WHERE id=1; DO SLEEP(5); COMMIT;
-- @b
DO SLEEP(1.5);
SET SESSION innodb_lock_wait_timeout=1;
UPDATE acct SET bal=bal+1 WHERE id=1;
SELECT 'ANOMALY:no';
