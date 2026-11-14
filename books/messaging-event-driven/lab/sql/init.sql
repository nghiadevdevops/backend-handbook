CREATE DATABASE shop;
CREATE DATABASE inventory;
\c shop
CREATE TABLE orders (
  id bigserial PRIMARY KEY, customer_id text NOT NULL, total_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'PLACED', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outbox (
  id bigserial PRIMARY KEY, event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  aggregate_id text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz);
CREATE INDEX outbox_unpublished ON outbox (id) WHERE published_at IS NULL;
\c inventory
CREATE TABLE processed_messages (
  message_id text PRIMARY KEY, consumer text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_naive (id serial PRIMARY KEY, order_id bigint, reserved_cents bigint);
CREATE TABLE ledger       (id serial PRIMARY KEY, order_id bigint, reserved_cents bigint);
