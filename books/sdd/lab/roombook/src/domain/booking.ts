import { DomainError } from "./errors.ts";
import type { TimeSlot } from "./time-slot.ts";

export const FREE_CANCEL_MINUTES = 120;

export type BookingStatus = "CONFIRMED" | "CANCELLED";

/** Entity + aggregate root. Tham chiếu Room, Member bằng id, không giữ object. */
export class Booking {
  readonly booking_id: string;
  readonly room_id: string;
  readonly member_id: string;
  readonly slot: TimeSlot;
  readonly attendee_count: number;
  status: BookingStatus = "CONFIRMED";
  late_cancel = false;

  constructor(
    booking_id: string,
    room_id: string,
    member_id: string,
    slot: TimeSlot,
    attendee_count: number,
  ) {
    this.booking_id = booking_id;
    this.room_id = room_id;
    this.member_id = member_id;
    this.slot = slot;
    this.attendee_count = attendee_count;
  }

  cancel(by_member_id: string, now: Date): void {
    if (by_member_id !== this.member_id) {
      throw new DomainError("FORBIDDEN", "chỉ người đặt mới được hủy");
    }
    if (this.status === "CANCELLED") {
      throw new DomainError("ALREADY_CANCELLED");
    }
    if (now.getTime() >= this.slot.start_at.getTime()) {
      throw new DomainError("ALREADY_STARTED");
    }
    const minutes_left = (this.slot.start_at.getTime() - now.getTime()) / 60_000;
    this.late_cancel = minutes_left < FREE_CANCEL_MINUTES;
    this.status = "CANCELLED";
  }
}
