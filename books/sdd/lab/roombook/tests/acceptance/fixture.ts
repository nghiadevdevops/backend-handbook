import {
  FixedClock, InMemoryBookingRepository, InMemoryRoomRepository,
} from "../../src/adapters/in-memory.ts";
import { CancelBooking } from "../../src/application/cancel-booking.ts";
import { CreateBooking, type CreateBookingCommand } from "../../src/application/create-booking.ts";
import type { Booking } from "../../src/domain/booking.ts";
import type { Clock } from "../../src/ports/index.ts";

/** Tháng 11/2026; ngày 9 là thứ Hai (hôm nay trong fixture). Giờ tường theo UTC. */
export function at(day: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(2026, 10, day, hh, mm));
}

export const NOW = at(9, 7); // thứ Hai 07:00, trước giờ mở cửa

export interface Env {
  bookings: InMemoryBookingRepository;
  create: CreateBooking;
  cancel: CancelBooking;
  cmd(start: Date, end: Date, opts?: { n?: number; member?: string; room?: string }): CreateBookingCommand;
  book(start: Date, end: Date): Booking;
  /** Dựng use case hủy với đồng hồ khác (ví dụ đã qua giờ bắt đầu). */
  cancelAt(clock: Clock): CancelBooking;
}

export function makeEnv(): Env {
  const rooms = new InMemoryRoomRepository([{ room_id: "R1", name: "Phòng Cà Phê", capacity: 6 }]);
  const bookings = new InMemoryBookingRepository();
  const clock = new FixedClock(NOW);
  const create = new CreateBooking(rooms, bookings, clock);
  const cmd: Env["cmd"] = (start, end, { n = 4, member = "M1", room = "R1" } = {}) => ({
    member_id: member, room_id: room, start_at: start, end_at: end, attendee_count: n,
  });
  return {
    bookings,
    create,
    cancel: new CancelBooking(bookings, clock),
    cmd,
    book: (start, end) => create.execute(cmd(start, end)),
    cancelAt: (c) => new CancelBooking(bookings, c),
  };
}
