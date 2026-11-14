import { Booking } from "../domain/booking.ts";
import { DomainError } from "../domain/errors.ts";
import { TimeSlot } from "../domain/time-slot.ts";
import type { BookingRepository, Clock, RoomRepository } from "../ports/index.ts";

const OPEN_AT_MINUTES = 8 * 60;
const CLOSE_AT_MINUTES = 18 * 60;
export const MAX_DURATION_MINUTES = 240;
export const MAX_ACTIVE_BOOKINGS = 3;

export interface CreateBookingCommand {
  member_id: string;
  room_id: string;
  start_at: Date;
  end_at: Date;
  attendee_count: number;
}

const minutesOfDay = (d: Date): number => d.getUTCHours() * 60 + d.getUTCMinutes();
const sameDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/** UC-001. Phụ thuộc port (RoomRepository, BookingRepository, Clock), không biết adapter. */
export class CreateBooking {
  private readonly rooms: RoomRepository;
  private readonly bookings: BookingRepository;
  private readonly clock: Clock;

  constructor(rooms: RoomRepository, bookings: BookingRepository, clock: Clock) {
    this.rooms = rooms;
    this.bookings = bookings;
    this.clock = clock;
  }

  execute(cmd: CreateBookingCommand): Booking {
    const room = this.rooms.get(cmd.room_id);
    if (room === undefined) throw new DomainError("ROOM_NOT_FOUND");
    const slot = new TimeSlot(cmd.start_at, cmd.end_at);
    const now = this.clock.now();

    if (slot.start_at.getTime() <= now.getTime()) throw new DomainError("START_IN_PAST");
    if (
      !sameDay(slot.start_at, slot.end_at) ||
      minutesOfDay(slot.start_at) < OPEN_AT_MINUTES ||
      minutesOfDay(slot.end_at) > CLOSE_AT_MINUTES
    ) {
      throw new DomainError("OUTSIDE_OPENING_HOURS");
    }
    if (slot.duration_minutes > MAX_DURATION_MINUTES) throw new DomainError("DURATION_TOO_LONG");
    if (cmd.attendee_count > room.capacity) throw new DomainError("CAPACITY_EXCEEDED");
    const upcoming = this.bookings
      .list_confirmed_by_member(cmd.member_id)
      .filter((b) => b.slot.start_at.getTime() > now.getTime());
    if (upcoming.length >= MAX_ACTIVE_BOOKINGS) throw new DomainError("QUOTA_EXCEEDED");
    if (this.bookings.list_confirmed_by_room(room.room_id).some((b) => b.slot.overlaps(slot))) {
      throw new DomainError("BOOKING_OVERLAP");
    }

    const booking = new Booking(
      this.bookings.next_id(), room.room_id, cmd.member_id, slot, cmd.attendee_count,
    );
    this.bookings.add(booking);
    return booking;
  }
}
