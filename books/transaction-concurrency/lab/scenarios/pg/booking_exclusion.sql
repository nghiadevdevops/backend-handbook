-- @setup
CREATE EXTENSION IF NOT EXISTS btree_gist;
DROP TABLE IF EXISTS booking; CREATE TABLE booking(id serial PRIMARY KEY, room int, s int, e int, EXCLUDE USING gist (room WITH =, int4range(s,e) WITH &&));
-- @a
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT count(*) AS c FROM booking WHERE room=1 AND s < 12 AND e > 10 \gset a_
SELECT pg_sleep(5);
INSERT INTO booking(room,s,e) SELECT 1,10,12 WHERE :a_c = 0;
COMMIT;
-- @b
SELECT pg_sleep(1.5);
BEGIN ISOLATION LEVEL __LEVEL__;
SELECT count(*) AS c FROM booking WHERE room=1 AND s < 11 AND e > 9 \gset b_
SELECT pg_sleep(1);
INSERT INTO booking(room,s,e) SELECT 1,9,11 WHERE :b_c = 0;
COMMIT;
-- @final
SELECT 'số booking phòng 1 (kỳ vọng 1)', count(*) FROM booking;
SELECT CASE WHEN count(*)>1 THEN 'ANOMALY:yes' ELSE 'ANOMALY:no' END FROM booking;
