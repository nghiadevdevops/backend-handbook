-- Chuong 5: vector 3 chieu viet tay de thay phep do khoang cach (khong phai embedding that)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TEMP TABLE demo(id int, label text, v vector(3));
INSERT INTO demo VALUES
 (1,'hoan tien',      '[0.9, 0.1, 0.0]'),
 (2,'lay lai tien',   '[0.8, 0.2, 0.1]'),
 (3,'doi mat khau',   '[0.0, 0.1, 0.9]');
SELECT label, round((1 - (v <=> '[0.85,0.15,0.05]'))::numeric, 3) AS cosine_sim
FROM demo ORDER BY v <=> '[0.85,0.15,0.05]';
-- chieu dai cac toan tu
SELECT '[1,2,3]'::vector <-> '[4,5,6]' AS l2, '[1,2,3]'::vector <=> '[4,5,6]' AS cosine_dist,
       '[1,2,3]'::vector <#> '[4,5,6]' AS neg_inner_product, '[1,2,3]'::vector <+> '[4,5,6]' AS l1;
SELECT pg_column_size('[1,2,3]'::vector) AS bytes_vector3, pg_column_size('[1,2,3]'::halfvec) AS bytes_halfvec3;
