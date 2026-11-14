\set ON_ERROR_STOP on
SET max_parallel_maintenance_workers = 2;
SET maintenance_work_mem = '512MB';

-- 1a. HNSW m=32, ef_construction=128
SELECT clock_timestamp() AS t0 \gset
CREATE INDEX items_hnsw_32_128 ON items USING hnsw (emb vector_cosine_ops) WITH (m=32, ef_construction=128);
SELECT round(extract(epoch FROM clock_timestamp()-:'t0'::timestamptz)::numeric,1) AS bs, round(pg_relation_size('items_hnsw_32_128')/1048576.0,1) AS mb \gset
SET enable_seqscan = off;
SET hnsw.ef_search = 40;  INSERT INTO bench_res SELECT 'hnsw m=32 efc=128 ef_search=40',  :bs, :mb, b.* FROM bench(false) b;
SET hnsw.ef_search = 100; INSERT INTO bench_res SELECT 'hnsw m=32 efc=128 ef_search=100', :bs, :mb, b.* FROM bench(false) b;

-- 1b. Loc metadata (category = 1% so dong) tren HNSW
SET hnsw.ef_search = 40;
SET hnsw.iterative_scan = off;
INSERT INTO bench_res SELECT 'FILTER hnsw m=32 ef=40 iterative=off', :bs, :mb, b.* FROM bench(true) b;
SET hnsw.iterative_scan = relaxed_order;
INSERT INTO bench_res SELECT 'FILTER hnsw m=32 ef=40 relaxed_order', :bs, :mb, b.* FROM bench(true) b;
SET hnsw.iterative_scan = strict_order;
INSERT INTO bench_res SELECT 'FILTER hnsw m=32 ef=40 strict_order', :bs, :mb, b.* FROM bench(true) b;
RESET hnsw.iterative_scan; RESET hnsw.ef_search; RESET enable_seqscan;
DROP INDEX items_hnsw_32_128;

-- 1c. Loc: btree(category) + sap xep chinh xac tren ~500 dong
CREATE INDEX items_cat ON items(category);
ANALYZE items;
INSERT INTO bench_res SELECT 'FILTER btree(category) + exact sort', 0, round(pg_relation_size('items_cat')/1048576.0,1), b.* FROM bench(true) b;
DROP INDEX items_cat;

SELECT * FROM bench_res ORDER BY ctid;
