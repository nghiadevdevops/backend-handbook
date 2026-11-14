-- @setup
DROP TABLE IF EXISTS items; CREATE TABLE items(id INT AUTO_INCREMENT PRIMARY KEY, cat VARCHAR(5), flag INT DEFAULT 0) ENGINE=InnoDB;
INSERT INTO items(cat) VALUES ('x'),('x'),('y');
-- @a
SET TRANSACTION ISOLATION LEVEL __LEVEL__; START TRANSACTION;
SELECT COUNT(*) INTO @n1 FROM items WHERE cat='x';
DO SLEEP(5);
UPDATE items SET flag=1 WHERE cat='x';
SELECT COUNT(*) INTO @n2 FROM items WHERE cat='x';
SELECT COUNT(*) INTO @n3 FROM items WHERE flag=1;
COMMIT;
SELECT 'A đếm cat=x trước / sau UPDATE; số dòng flag=1', @n1, @n2, @n3;
SELECT IF(@n1<>@n2,'ANOMALY:yes','ANOMALY:no');
-- @b
DO SLEEP(2);
INSERT INTO items(cat) VALUES ('x');
