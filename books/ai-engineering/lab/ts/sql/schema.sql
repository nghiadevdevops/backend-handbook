-- Chương 11: schema cho demo (vector(3) để dữ liệu giả gọn; production dùng số chiều của model embedding, ví dụ 384).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE orders (
  id         bigserial PRIMARY KEY,
  tenant_id  int NOT NULL,
  code       text NOT NULL,
  status     text NOT NULL,
  shipped_at timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE kb_chunks (
  id        bigserial PRIMARY KEY,
  tenant_id int NOT NULL,
  doc_id    int NOT NULL,
  content   text NOT NULL,
  embedding vector(3) NOT NULL
);

CREATE TABLE conversations (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL,
  user_id    bigint NOT NULL,
  summary    text,                       -- tóm tắt phần cũ để cắt context
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversations (tenant_id);
CREATE INDEX ON conversations (user_id);

CREATE TABLE conversation_messages (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,                       -- user | assistant
  content         jsonb NOT NULL,                      -- nguyên content block (gồm tool_use/tool_result)
  status          text NOT NULL DEFAULT 'done',        -- pending | done | failed
  meta            jsonb,                               -- model, prompt_version, usage, context_ids, request_id
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON conversation_messages (conversation_id, id);

INSERT INTO orders (tenant_id, code, status, shipped_at) VALUES
  (1, 'A1029', 'shipped', '2026-11-02T08:00:00Z'),
  (2, 'A2000', 'processing', NULL);
INSERT INTO kb_chunks (tenant_id, doc_id, content, embedding) VALUES
  (1, 1, 'Đổi trả trong 7 ngày kể từ ngày nhận hàng.', '[1,0,0]'),
  (1, 2, 'Phí vận chuyển nội thành là 20.000đ.',        '[0,1,0]'),
  (1, 3, 'Bảo hành 12 tháng cho phụ kiện điện tử.',     '[0.1,0.1,0.9]'),
  (2, 4, 'Chính sách riêng của cửa hàng 2 (không được lộ sang tenant 1).', '[1,0,0]');
