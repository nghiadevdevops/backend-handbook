-- @setup
DROP TABLE IF EXISTS t; CREATE TABLE t(id INT PRIMARY KEY, v INT) ENGINE=InnoDB; INSERT INTO t VALUES (5,1),(30,1);
-- @a
SET TRANSACTION ISOLATION LEVEL __LEVEL__; START TRANSACTION;
SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE;
DO SLEEP(3);
SELECT 'data_locks', index_name, lock_type, lock_mode, lock_status, lock_data FROM performance_schema.data_locks WHERE object_name='t' ORDER BY lock_status DESC, lock_mode;
DO SLEEP(2);
COMMIT;
-- @b
DO SLEEP(1.5);
SET TRANSACTION ISOLATION LEVEL __LEVEL__; START TRANSACTION;
SET SESSION innodb_lock_wait_timeout=5;
INSERT INTO t VALUES (15,1);
SELECT 'B insert id=15 xong';
COMMIT;
SELECT 'ANOMALY:no';
