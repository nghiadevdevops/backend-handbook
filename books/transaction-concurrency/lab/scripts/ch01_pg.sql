DROP TABLE IF EXISTS t1; CREATE TABLE t1(id int PRIMARY KEY, note text);
BEGIN;
INSERT INTO t1 VALUES (1,'a');
SAVEPOINT sp1;
INSERT INTO t1 VALUES (1,'trùng khóa');   -- lỗi
SELECT 'sau lỗi';                          -- bị từ chối: transaction aborted
ROLLBACK TO SAVEPOINT sp1;
INSERT INTO t1 VALUES (2,'b');
COMMIT;
SELECT * FROM t1 ORDER BY id;
-- DDL có transaction
BEGIN; CREATE TABLE t2(x int); ROLLBACK;
SELECT to_regclass('t2') AS t2_sau_rollback;
BEGIN; INSERT INTO t1 VALUES (3,'c'); SELECT 'ẩn';
ROLLBACK;
