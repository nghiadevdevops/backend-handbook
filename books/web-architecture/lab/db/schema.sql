CREATE TABLE IF NOT EXISTS ebooks (
  id             varchar(64) PRIMARY KEY,
  title          text        NOT NULL,
  price_amount   bigint      NOT NULL CHECK (price_amount >= 0),
  price_currency char(3)     NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id          uuid        PRIMARY KEY,
  customer_id varchar(64) NOT NULL,
  status      varchar(16) NOT NULL,
  placed_at   timestamptz NOT NULL,
  paid_at     timestamptz
);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);

CREATE TABLE IF NOT EXISTS order_lines (
  order_id       uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  position       smallint    NOT NULL,
  ebook_id       varchar(64) NOT NULL,
  title          text        NOT NULL,
  price_amount   bigint      NOT NULL CHECK (price_amount >= 0),
  price_currency char(3)     NOT NULL,
  PRIMARY KEY (order_id, position)
);
