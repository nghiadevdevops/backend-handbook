// Tiến trình MCP server cho demo: dữ liệu đơn hàng giả trong bộ nhớ, tenant lấy từ biến môi trường.
import type { Db } from "./db.ts";
import { serveOrdersOverStdio } from "./mcpServer.ts";

const orders = [
  { tenant_id: 1, code: "A1029", status: "shipped", shipped_at: "2026-11-02T08:00:00Z" },
  { tenant_id: 2, code: "A2000", status: "processing", shipped_at: null },
];

const fakeDb: Db = {
  async query(_text, values = []) {
    const [tenant, code] = values as [number, string];
    const row = orders.find((o) => o.tenant_id === tenant && o.code === code);
    return { rows: row ? [{ code: row.code, status: row.status, shipped_at: row.shipped_at }] : [] } as never;
  },
};

serveOrdersOverStdio(fakeDb, { id: 1, tenantId: Number(process.env.SHOPASSIST_TENANT_ID ?? "1") });
