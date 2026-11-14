-- Chuong 7: hybrid search (vector + tu khoa) hop nhat bang RRF. Vector 3 chieu viet tay.
CREATE TEMP TABLE kb_chunks (
  id int PRIMARY KEY, tenant_id int, content text, embedding vector(3),
  content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
INSERT INTO kb_chunks(id, tenant_id, content, embedding) VALUES
 (1, 7, 'Chinh sach hoan tien trong 7 ngay ke tu ngay nhan hang',  '[0.9,0.1,0.0]'),
 (2, 7, 'San pham giam gia tren 50 phan tram khong duoc hoan tien', '[0.8,0.3,0.0]'),
 (3, 7, 'Huong dan doi mat khau tai khoan',                         '[0.0,0.1,0.9]'),
 (4, 7, 'Ma don A1029 giao tai kho Ha Noi',                         '[0.1,0.9,0.1]'),
 (5, 8, 'Chinh sach hoan tien cua cua hang khac',                   '[0.9,0.1,0.0]');
CREATE INDEX ON kb_chunks USING gin(content_tsv);

-- truy van 'A1029': vector khong bat duoc ma don, tu khoa thi co; tenant 7 (tenant 8 khong duoc lo ra)
PREPARE hybrid(vector, text, int) AS
WITH vec AS (
  SELECT id, row_number() OVER (ORDER BY embedding <=> $1) AS rnk
  FROM kb_chunks WHERE tenant_id = $3 ORDER BY embedding <=> $1 LIMIT 30
), kw AS (
  SELECT id, row_number() OVER (ORDER BY ts_rank(content_tsv, q) DESC) AS rnk
  FROM kb_chunks, websearch_to_tsquery('simple', $2) q
  WHERE tenant_id = $3 AND content_tsv @@ q ORDER BY ts_rank(content_tsv, q) DESC LIMIT 30
)
SELECT c.id, c.content, vec.rnk AS vec_rank, kw.rnk AS kw_rank,
       round((coalesce(1.0/(60 + vec.rnk), 0) + coalesce(1.0/(60 + kw.rnk), 0))::numeric, 5) AS rrf
FROM kb_chunks c
LEFT JOIN vec ON vec.id = c.id
LEFT JOIN kw  ON kw.id  = c.id
WHERE vec.id IS NOT NULL OR kw.id IS NOT NULL
ORDER BY rrf DESC LIMIT 10;

\echo '--- truy van: A1029 (vector gan "hoan tien", tu khoa la ma don)'
EXECUTE hybrid('[0.85,0.2,0.05]', 'A1029', 7);
\echo '--- truy van: hoan tien'
EXECUTE hybrid('[0.85,0.2,0.05]', 'hoan tien', 7);
