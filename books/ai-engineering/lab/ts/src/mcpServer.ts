// Chương 4: MCP server (SDK TypeScript v2, spec 2026-07-28) công bố tool lookup_order qua stdio.
// Server stdio không có login session, nên tenant lấy từ cấu hình tiến trình (biến môi trường), không từ model.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import type { Db, User } from "./db.ts";
import { lookupOrderHandler } from "./lookupOrderHandler.ts";

export function createLookupServer(db: Db, user: User): McpServer {
  const server = new McpServer({ name: "shopassist-orders", version: "1.0.0" });
  const lookup = lookupOrderHandler(db, user);

  server.registerTool(
    "lookup_order",
    {
      description:
        "Tra trạng thái một đơn hàng theo mã đơn (dạng A1029). Chỉ dùng khi người hỏi nêu rõ mã đơn. Không dùng để tìm đơn theo tên khách.",
      inputSchema: z.object({ order_id: z.string().describe("Mã đơn, ví dụ A1029") }),
    },
    async ({ order_id }) => {
      const text = await lookup({ order_id });
      // Lỗi nghiệp vụ trả về dạng kết quả để model tự sửa; không ném exception.
      const isError = text.startsWith("Mã đơn không hợp lệ") || text.startsWith("Không tìm thấy");
      return { content: [{ type: "text", text }], isError };
    },
  );
  return server;
}

export function serveOrdersOverStdio(db: Db, user: User): void {
  serveStdio(() => createLookupServer(db, user));
}
