import type { Booking } from "../domain/booking.ts";
import type { Room } from "../domain/room.ts";
import type { BookingRepository, Clock, RoomRepository } from "../ports/index.ts";

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms: Map<string, Room>;

  constructor(rooms: Room[]) {
    this.rooms = new Map(rooms.map((r) => [r.room_id, r]));
  }

  get(room_id: string): Room | undefined {
    return this.rooms.get(room_id);
  }
}

export class InMemoryBookingRepository implements BookingRepository {
  private readonly items = new Map<string, Booking>();
  private seq = 0;

  next_id(): string {
    this.seq += 1;
    return `B${String(this.seq).padStart(4, "0")}`;
  }

  add(booking: Booking): void {
    this.items.set(booking.booking_id, booking);
  }

  get(booking_id: string): Booking | undefined {
    return this.items.get(booking_id);
  }

  list_confirmed_by_room(room_id: string): Booking[] {
    return [...this.items.values()].filter(
      (b) => b.room_id === room_id && b.status === "CONFIRMED",
    );
  }

  list_confirmed_by_member(member_id: string): Booking[] {
    return [...this.items.values()].filter(
      (b) => b.member_id === member_id && b.status === "CONFIRMED",
    );
  }
}

/** Adapter dùng cho test: đồng hồ cố định. */
export class FixedClock implements Clock {
  private readonly current: Date;

  constructor(now: Date) {
    this.current = now;
  }

  now(): Date {
    return this.current;
  }
}
