DROP TABLE IF EXISTS orders;
CREATE TABLE orders (
  id          bigserial PRIMARY KEY,
  customer_id int NOT NULL,
  total       int NOT NULL,
  status      text NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO orders (customer_id, total, status)
SELECT (random()*50000)::int, (random()*100000)::int, 'new'
FROM generate_series(1, :rows);
ANALYZE orders;
