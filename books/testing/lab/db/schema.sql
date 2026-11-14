CREATE TABLE IF NOT EXISTS orders (
    id          text PRIMARY KEY,
    customer_id text NOT NULL,
    status      text NOT NULL CHECK (status IN ('draft','placed','paid','cancelled')),
    placed_at   timestamptz NULL
);

CREATE TABLE IF NOT EXISTS order_lines (
    order_id   text    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    position   integer NOT NULL,
    sku        text    NOT NULL,
    quantity   integer NOT NULL CHECK (quantity >= 1),
    unit_price bigint  NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, position)
);
