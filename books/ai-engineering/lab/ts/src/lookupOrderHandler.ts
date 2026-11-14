// Tool lookup_order (chương 4, 9): quyền lấy từ người dùng đang đăng nhập, KHÔNG từ model.
import type { Db, User } from "./db.ts";

export type ToolHandler = (input: Record<string, unknown>) => Promise<string>;

export function lookupOrderHandler(db: Db, user: User): ToolHandler {
  return async (input) => {
    const id = String(input.order_id ?? "");
    if (!/^A\d{4}$/.test(id)) {
      return "Mã đơn không hợp lệ. Định dạng đúng: A + 4 chữ số.";
    }
    // Chỉ đơn của cửa hàng mà nhân viên này được phép; chỉ lấy cột cần thiết.
    const { rows } = await db.query(
      "SELECT code, status, shipped_at FROM orders WHERE tenant_id = $1 AND code = $2",
      [user.tenantId, id],
    );
    return rows[0] ? JSON.stringify(rows[0]) : `Không tìm thấy đơn ${id} trong cửa hàng của bạn.`;
  };
}
