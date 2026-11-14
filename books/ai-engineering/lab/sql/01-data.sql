-- Sinh 50k vector tong hop 384 chieu, co cau truc cum (200 cum) de gan voi du lieu embedding that.
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion AS pgvector_version FROM pg_extension WHERE extname='vector';
SELECT setseed(0.42);

DROP TABLE IF EXISTS centers, items, queries, gt, gt_f CASCADE;

CREATE TABLE centers AS
SELECT c AS cid, l2_normalize(array_agg(random()-0.5 ORDER BY d)::vector(384)) AS v
FROM generate_series(1,200) c, generate_series(1,384) d
GROUP BY c;

CREATE TABLE items (
  id        int PRIMARY KEY,
  category  int NOT NULL,          -- 100 gia tri, do chon loc 1%
  emb       vector(384) NOT NULL
);

INSERT INTO items
SELECT g, g % 100,
       l2_normalize(ct.v + n.a::vector(384))
FROM generate_series(1,50000) g
JOIN centers ct ON ct.cid = 1 + (g * 7919) % 200
CROSS JOIN LATERAL (SELECT array_agg((random()-0.5)*0.08) a FROM generate_series(1,384) d WHERE g > 0) n;

CREATE TABLE queries (
  qid int PRIMARY KEY,
  category int NOT NULL,
  v vector(384) NOT NULL
);
INSERT INTO queries
SELECT q, (q-1) % 100,
       l2_normalize(ct.v + n.a::vector(384))
FROM generate_series(1,100) q
JOIN centers ct ON ct.cid = 1 + (q * 104729) % 200
CROSS JOIN LATERAL (SELECT array_agg((random()-0.5)*0.08) a FROM generate_series(1,384) d WHERE q > 0) n;

VACUUM ANALYZE items; ANALYZE queries;
SELECT count(*) AS rows, pg_size_pretty(pg_table_size('items')) AS table_size FROM items;
