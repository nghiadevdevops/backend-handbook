-- @setup
DROP TABLE IF EXISTS doctors, shifts; CREATE TABLE doctors(id int PRIMARY KEY, name text, on_call boolean);
CREATE TABLE shifts(id int PRIMARY KEY);
INSERT INTO doctors VALUES (1,'Alice',true),(2,'Bob',true); INSERT INTO shifts VALUES (1);
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT id FROM shifts WHERE id=1 FOR UPDATE;
SELECT count(*) AS c FROM doctors WHERE on_call \gset a_
SELECT pg_sleep(4);
UPDATE doctors SET on_call=false WHERE id=1 AND :a_c >= 2;
COMMIT;
-- @b
SELECT pg_sleep(2);
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT id FROM shifts WHERE id=1 FOR UPDATE;
SELECT count(*) AS c FROM doctors WHERE on_call \gset b_
UPDATE doctors SET on_call=false WHERE id=2 AND :b_c >= 2;
COMMIT;
-- @final
SELECT 'số bác sĩ còn trực', count(*) FROM doctors WHERE on_call;
SELECT CASE WHEN count(*)=0 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM doctors WHERE on_call;
