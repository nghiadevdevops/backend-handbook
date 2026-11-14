CREATE TABLE IF NOT EXISTS products (
  id int PRIMARY KEY, name text NOT NULL, price numeric(10,2) NOT NULL,
  stock int NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS query_log (id bigserial PRIMARY KEY, at timestamptz DEFAULT now(), tag text);
INSERT INTO products SELECT g, 'Book '||g, 5 + g, 100, now() FROM generate_series(1,1000) g ON CONFLICT DO NOTHING;
