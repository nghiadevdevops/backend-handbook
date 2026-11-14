-- @setup
DROP TABLE IF EXISTS mv; CREATE TABLE mv(id INT PRIMARY KEY, v INT) ENGINE=InnoDB;
INSERT INTO mv WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM s WHERE n<1000) SELECT n, 0 FROM s;
-- @a
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ; START TRANSACTION;
SELECT 'A giữ read view, count =', COUNT(*) FROM mv;
DO SLEEP(14);
COMMIT;
-- @b
SELECT 'B: history list length ban đầu', count FROM information_schema.INNODB_METRICS WHERE name='trx_rseg_history_len';
DO SLEEP(1);
UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1; UPDATE mv SET v=v+1;
DO SLEEP(5);
SELECT 'B: khi A còn mở (sau 5 UPDATE toàn bảng)', count FROM information_schema.INNODB_METRICS WHERE name='trx_rseg_history_len';
DO SLEEP(14);
SELECT 'B: sau khi A đã commit 5 giây (purge)', count FROM information_schema.INNODB_METRICS WHERE name='trx_rseg_history_len';
DO SLEEP(10);
SELECT 'B: sau thêm 10 giây', count FROM information_schema.INNODB_METRICS WHERE name='trx_rseg_history_len';
