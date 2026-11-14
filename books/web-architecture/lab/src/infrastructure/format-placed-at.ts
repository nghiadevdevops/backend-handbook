/** "2026-11-07 09:30" (UTC): định dạng giờ đặt của read model, dùng chung cho mọi adapter đọc. */
export function formatPlacedAt(date: Date): string {
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
