// Kiểu tối thiểu mà các module cần từ pg; cho phép test bằng fake và dùng được với Pool hoặc PoolClient.
export interface Db {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

export interface User {
  id: number;
  tenantId: number;
}
