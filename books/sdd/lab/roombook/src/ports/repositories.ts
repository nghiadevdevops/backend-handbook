import type { Booking } from "../domain/booking.ts";
import type { Room } from "../domain/room.ts";

/** Port (interface). Adapter nằm ở src/adapters/. */
export interface RoomRepository {
  get(room_id: string): Room | undefined;
}

export interface BookingRepository {
  add(booking: Booking): void;
  get(booking_id: string): Booking | undefined;
  list_confirmed_by_room(room_id: string): Booking[];
  list_confirmed_by_member(member_id: string): Booking[];
  next_id(): string;
}
