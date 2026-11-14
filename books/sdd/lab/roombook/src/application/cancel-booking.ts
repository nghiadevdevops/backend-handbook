import type { Booking } from "../domain/booking.ts";
import { DomainError } from "../domain/errors.ts";
import type { BookingRepository, Clock } from "../ports/index.ts";

export interface CancelBookingCommand {
  member_id: string;
  booking_id: string;
}

/** UC-002. */
export class CancelBooking {
  private readonly bookings: BookingRepository;
  private readonly clock: Clock;

  constructor(bookings: BookingRepository, clock: Clock) {
    this.bookings = bookings;
    this.clock = clock;
  }

  execute(cmd: CancelBookingCommand): Booking {
    const booking = this.bookings.get(cmd.booking_id);
    if (booking === undefined) throw new DomainError("BOOKING_NOT_FOUND");
    booking.cancel(cmd.member_id, this.clock.now());
    return booking;
  }
}
