import { DomainError } from "./errors.ts";

// Datetime trong lab là "giờ tường" (wall-clock) biểu diễn bằng Date theo UTC:
// dùng getUTC* để kết quả không phụ thuộc time zone của máy chạy test.

/** Value object: không có định danh, so sánh theo giá trị, bất biến. */
export class TimeSlot {
  readonly start_at: Date;
  readonly end_at: Date;

  constructor(start_at: Date, end_at: Date) {
    if (end_at.getTime() <= start_at.getTime()) {
      throw new DomainError("INVALID_TIME_RANGE", "end_at phải sau start_at");
    }
    this.start_at = new Date(start_at);
    this.end_at = new Date(end_at);
    Object.freeze(this);
  }

  get duration_minutes(): number {
    return Math.floor((this.end_at.getTime() - this.start_at.getTime()) / 60_000);
  }

  // Nửa mở [start_at, end_at): hai slot liền nhau KHÔNG chồng lấn.
  overlaps(other: TimeSlot): boolean {
    return (
      this.start_at.getTime() < other.end_at.getTime() &&
      other.start_at.getTime() < this.end_at.getTime()
    );
  }
}
