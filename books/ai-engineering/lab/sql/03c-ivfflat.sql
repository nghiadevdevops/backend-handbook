\set ON_ERROR_STOP on
SET max_parallel_maintenance_workers = 2;
SET maintenance_work_mem = '512MB';

-- 2. IVFFlat lists=50 (= rows/1000)
SELECT clock_timestamp() AS t0 \gset
CREATE INDEX items_ivf_50 ON items USING ivfflat (emb vector_cosine_ops) WITH (lists=50);
SELECT round(extract(epoch FROM clock_timestamp()-:'t0'::timestamptz)::numeric,1) AS bs, round(pg_relation_size('items_ivf_50')/1048576.0,1) AS mb \gset
SET enable_seqscan = off;
SET ivfflat.probes = 1;  INSERT INTO bench_res SELECT 'ivfflat lists=50 probes=1',  :bs, :mb, b.* FROM bench(false) b;
SET ivfflat.probes = 10; INSERT INTO bench_res SELECT 'ivfflat lists=50 probes=10', :bs, :mb, b.* FROM bench(false) b;
SET ivfflat.probes = 25; INSERT INTO bench_res SELECT 'ivfflat lists=50 probes=25', :bs, :mb, b.* FROM bench(false) b;
RESET enable_seqscan; RESET ivfflat.probes;
DROP INDEX items_ivf_50;

-- 2a. IVFFlat lists=224 (~sqrt(rows))
SELECT clock_timestamp() AS t0 \gset
CREATE INDEX items_ivf_224 ON items USING ivfflat (emb vector_cosine_ops) WITH (lists=224);
SELECT round(extract(epoch FROM clock_timestamp()-:'t0'::timestamptz)::numeric,1) AS bs, round(pg_relation_size('items_ivf_224')/1048576.0,1) AS mb \gset
SET enable_seqscan = off;
SET ivfflat.probes = 1;  INSERT INTO bench_res SELECT 'ivfflat lists=224 probes=1',  :bs, :mb, b.* FROM bench(false) b;
SET ivfflat.probes = 15; INSERT INTO bench_res SELECT 'ivfflat lists=224 probes=15', :bs, :mb, b.* FROM bench(false) b;
SET ivfflat.probes = 50; INSERT INTO bench_res SELECT 'ivfflat lists=224 probes=50', :bs, :mb, b.* FROM bench(false) b;
RESET enable_seqscan; RESET ivfflat.probes;
DROP INDEX items_ivf_224;

SELECT * FROM bench_res ORDER BY ctid;
