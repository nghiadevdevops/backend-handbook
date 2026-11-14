-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int, ver int DEFAULT 0); INSERT INTO acct VALUES (1,100,0);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT bal, ver FROM acct WHERE id=1 \gset a_
COMMIT;
SELECT pg_sleep(5);
WITH u AS (UPDATE acct SET bal=:a_bal+10, ver=ver+1 WHERE id=1 AND ver=:a_ver RETURNING 1) SELECT count(*) AS n FROM u \gset a_
SELECT 'A: số dòng cập nhật được (CAS lần 1)', :a_n;
SELECT (:a_n = 0) AS retry \gset
\if :retry
  SELECT bal, ver FROM acct WHERE id=1 \gset r_
  WITH u AS (UPDATE acct SET bal=:r_bal+10, ver=ver+1 WHERE id=1 AND ver=:r_ver RETURNING 1) SELECT count(*) AS n FROM u \gset r_
  SELECT 'A: CAS lần 2 sau khi đọc lại', :r_n;
\endif
-- @b
SELECT pg_sleep(1.5);
SELECT bal, ver FROM acct WHERE id=1 \gset b_
SELECT pg_sleep(1);
WITH u AS (UPDATE acct SET bal=:b_bal+20, ver=ver+1 WHERE id=1 AND ver=:b_ver RETURNING 1) SELECT count(*) AS n FROM u \gset b_
SELECT 'B: số dòng cập nhật được', :b_n;
-- @final
SELECT 'số dư cuối (kỳ vọng 130), ver', bal, ver FROM acct WHERE id=1;
SELECT CASE WHEN bal<>130 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM acct;
