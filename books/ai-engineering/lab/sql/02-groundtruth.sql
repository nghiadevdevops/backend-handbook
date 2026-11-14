-- Ground truth = tim kiem chinh xac (seq scan, chua co index vector nao).
CREATE TABLE gt AS
SELECT q.qid, array_agg(r.id ORDER BY r.rn) AS ids
FROM queries q
CROSS JOIN LATERAL (
  SELECT i.id, row_number() OVER (ORDER BY i.emb <=> q.v) rn
  FROM (SELECT id, emb FROM items ORDER BY emb <=> q.v LIMIT 10) i
) r
GROUP BY q.qid;

CREATE TABLE gt_f AS
SELECT q.qid, array_agg(r.id ORDER BY r.rn) AS ids
FROM queries q
CROSS JOIN LATERAL (
  SELECT i.id, row_number() OVER (ORDER BY i.emb <=> q.v) rn
  FROM (SELECT id, emb FROM items WHERE category = q.category ORDER BY emb <=> q.v LIMIT 10) i
) r
GROUP BY q.qid;

-- bench(): chay 100 query, tra recall@10, latency trung binh / p95 (ms), so dong tra ve trung binh
CREATE TABLE IF NOT EXISTS bench_res(config text, build_s numeric, index_mb numeric, recall numeric, avg_ms numeric, p95_ms numeric, avg_rows numeric);
TRUNCATE bench_res;

CREATE OR REPLACE FUNCTION bench(filtered boolean,
  OUT recall numeric, OUT avg_ms numeric, OUT p95_ms numeric, OUT avg_rows numeric)
LANGUAGE plpgsql AS $$
DECLARE
  q record; ids int[]; truth int[]; t0 timestamptz;
  times double precision[] := '{}'; hits int := 0; total int := 0; rows_ int := 0;
BEGIN
  FOR q IN SELECT * FROM queries ORDER BY qid LOOP
    t0 := clock_timestamp();
    IF filtered THEN
      EXECUTE 'SELECT array_agg(id) FROM (SELECT id FROM items WHERE category = $2 ORDER BY emb <=> $1 LIMIT 10) s'
        INTO ids USING q.v, q.category;
      SELECT g.ids INTO truth FROM gt_f g WHERE g.qid = q.qid;
    ELSE
      EXECUTE 'SELECT array_agg(id) FROM (SELECT id FROM items ORDER BY emb <=> $1 LIMIT 10) s'
        INTO ids USING q.v;
      SELECT g.ids INTO truth FROM gt g WHERE g.qid = q.qid;
    END IF;
    times := times || (extract(epoch FROM clock_timestamp() - t0) * 1000);
    ids := coalesce(ids, '{}');
    rows_ := rows_ + cardinality(ids);
    total := total + cardinality(truth);
    hits := hits + (SELECT count(*) FROM unnest(ids) x WHERE x = ANY(truth));
  END LOOP;
  recall := round(hits::numeric / total, 3);
  SELECT round(avg(t)::numeric,2), round((percentile_cont(0.95) WITHIN GROUP (ORDER BY t))::numeric,2)
    INTO avg_ms, p95_ms FROM unnest(times) t;
  avg_rows := round(rows_::numeric / 100, 1);
END $$;
