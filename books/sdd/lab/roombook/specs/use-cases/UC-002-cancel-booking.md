# UC-002: Hủy đặt phòng

## Metadata
- BR: [BR-001](../business-requirements/BR-001-self-service-room-booking.md)
- Trạng thái: Approved
- Code: `src/application/cancel-booking.ts` (`CancelBooking`), `Booking.cancel()`
- Test: `tests/acceptance/uc002-cancel-booking.test.ts`

## Actor
Nhân viên đã tạo lượt đặt (Member, là chủ của `Booking`).

## Trigger
Nhân viên bấm "Hủy" trên một lượt đặt của mình.

## Preconditions
Lượt đặt tồn tại.

## Main Flow
1. Hệ thống nhận `booking_id` và `member_id` của người thực hiện.
2. Hệ thống kiểm tra các điều kiện ở mục Exceptions.
3. Hệ thống đặt `status = CANCELLED`.
4. Nếu thời gian còn lại đến `start_at` nhỏ hơn 120 phút thì đặt `late_cancel = true`, ngược lại `false`.

## Alternative Flows
Không có.

## Exceptions
| Mã lỗi | Điều kiện |
|---|---|
| `BOOKING_NOT_FOUND` | `booking_id` không tồn tại |
| `FORBIDDEN` | người thực hiện không phải chủ lượt đặt |
| `ALREADY_CANCELLED` | lượt đặt đã ở trạng thái `CANCELLED` |
| `ALREADY_STARTED` | thời điểm hiện tại không trước `start_at` |

## Postconditions
`Booking.status = CANCELLED`; khung giờ được giải phóng cho người khác (vì `BOOKING_OVERLAP` chỉ xét booking `CONFIRMED`).

## Acceptance Criteria
"Bây giờ" là 2026-11-09 07:00 (trừ AC-002-4).

| ID | Given | When | Then |
|---|---|---|---|
| AC-002-1 | M1 có booking 09:00 đến 10:00 (còn đúng 120 phút) | M1 hủy | `CANCELLED`, `late_cancel = false` |
| AC-002-2 | M1 có booking 08:30 đến 09:30 (còn 90 phút) | M1 hủy | `CANCELLED`, `late_cancel = true` |
| AC-002-3 | M1 có booking 09:00 đến 10:00 | M2 hủy | lỗi `FORBIDDEN` |
| AC-002-4 | M1 có booking 09:00 đến 10:00, bây giờ là 09:30 | M1 hủy | lỗi `ALREADY_STARTED` |
| AC-002-5 | booking đã `CANCELLED` | M1 hủy lần nữa | lỗi `ALREADY_CANCELLED` |

## Dependencies
Entity `Booking`, `Member`; UC-001 (tạo ra `Booking`).

## Lịch sử
- 2026-11-02: tạo bản đầu.
