-- @setup
DROP TABLE IF EXISTS acct; CREATE TABLE acct(id INT PRIMARY KEY, bal INT, ver INT DEFAULT 0) ENGINE=InnoDB; INSERT INTO acct VALUES (1,100,0);
-- @a
SET TRANSACTION ISOLATION LEVEL __LEVEL__; START TRANSACTION;
SELECT bal, ver INTO @a, @av FROM acct WHERE id=1;
COMMIT;
DO SLEEP(5);
UPDATE acct SET bal=@a+10, ver=ver+1 WHERE id=1 AND ver=@av;
SELECT ROW_COUNT() INTO @n;
SELECT 'A: số dòng cập nhật được (CAS lần 1)', @n;
SELECT bal, ver INTO @r, @rv FROM acct WHERE id=1;
UPDATE acct SET bal=@r+10, ver=ver+1 WHERE id=1 AND ver=@rv AND @n=0;
SELECT 'A: CAS lần 2 (chỉ chạy nếu lần 1 = 0), số dòng', ROW_COUNT();
-- @b
DO SLEEP(1.5);
SELECT bal, ver INTO @b, @bv FROM acct WHERE id=1;
DO SLEEP(1);
UPDATE acct SET bal=@b+20, ver=ver+1 WHERE id=1 AND ver=@bv;
SELECT 'B: số dòng cập nhật được', ROW_COUNT();
-- @final
SELECT 'số dư cuối (kỳ vọng 130), ver', bal, ver FROM acct WHERE id=1;
SELECT IF(bal<>130,'ANOMALY:yes','ANOMALY:no') FROM acct;
