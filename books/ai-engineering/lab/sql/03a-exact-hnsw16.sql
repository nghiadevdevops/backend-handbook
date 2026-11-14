\set ON_ERROR_STOP on
SET max_parallel_maintenance_workers = 2;
SET maintenance_work_mem = '512MB';

-- 0. Exact (khong index vector)
SET enable_indexscan = off;
INSERT INTO bench_res SELECT 'exact (seq scan)', 0, 0, b.* FROM bench(false) b;
RESET enable_indexscan;

-- 1. HNSW m=16, ef_construction=64 (mac dinh)
SELECT clock_timestamp() AS t0 \gset
CREATE INDEX items_hnsw_16_64 ON items USING hnsw (emb vector_cosine_ops) WITH (m=16, ef_construction=64);
SELECT round(extract(epoch FROM clock_timestamp()-:'t0'::timestamptz)::numeric,1) AS bs, round(pg_relation_size('items_hnsw_16_64')/1048576.0,1) AS mb \gset
SET enable_seqscan = off;
SET hnsw.ef_search = 10;  INSERT INTO bench_res SELECT 'hnsw m=16 efc=64 ef_search=10',  :bs, :mb, b.* FROM bench(false) b;
SET hnsw.ef_search = 40;  INSERT INTO bench_res SELECT 'hnsw m=16 efc=64 ef_search=40',  :bs, :mb, b.* FROM bench(false) b;
SET hnsw.ef_search = 100; INSERT INTO bench_res SELECT 'hnsw m=16 efc=64 ef_search=100', :bs, :mb, b.* FROM bench(false) b;
RESET enable_seqscan; RESET hnsw.ef_search;
DROP INDEX items_hnsw_16_64;

SELECT * FROM bench_res ORDER BY ctid;
