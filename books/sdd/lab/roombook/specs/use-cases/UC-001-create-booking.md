# UC-001: Tạo đặt phòng

## Metadata
- BR: [BR-001](../business-requirements/BR-001-self-service-room-booking.md)
- Trạng thái: Approved
- Code: `src/application/create-booking.ts` (`CreateBooking`)
- Test: `tests/acceptance/uc001-create-booking.test.ts`

## Actor
Nhân viên (Member).

## Trigger
Nhân viên chọn phòng, khung giờ và số người tham dự rồi bấm "Đặt phòng".

## Preconditions
- Nhân viên đã đăng nhập.
- Phòng tồn tại.

## Main Flow
1. Hệ thống nhận `room_id`, `start_at`, `end_at`, `attendee_count`.
2. Hệ thống kiểm tra các quy tắc ở mục Exceptions.
3. Hệ thống tạo `Booking` với `status = CONFIRMED`, `late_cancel = false`.
4. Hệ thống trả về `booking_id`.

## Alternative Flows
- A1: hai lượt đặt liền nhau (`end_at` của lượt trước bằng `start_at` của lượt sau) là hợp lệ, vì khoảng thời gian tính nửa mở `[start_at, end_at)`.

## Exceptions
| Mã lỗi | Điều kiện |
|---|---|
| `ROOM_NOT_FOUND` | `room_id` không tồn tại |
| `START_IN_PAST` | `start_at` không sau thời điểm hiện tại |
| `OUTSIDE_OPENING_HOURS` | `start_at` trước 08:00, `end_at` sau 18:00, hoặc khác ngày |
| `DURATION_TOO_LONG` | thời lượng lớn hơn 240 phút |
| `CAPACITY_EXCEEDED` | `attendee_count` lớn hơn `Room.capacity` |
| `QUOTA_EXCEEDED` | nhân viên đã có 3 lượt đặt `CONFIRMED` với `start_at` sau hiện tại |
| `BOOKING_OVERLAP` | trùng khoảng thời gian với một `Booking` `CONFIRMED` khác của cùng phòng |

## Postconditions
Có thêm đúng 1 `Booking` ở trạng thái `CONFIRMED` (chỉ khi thành công).

## Acceptance Criteria
Quy ước thời gian trong ví dụ: "bây giờ" là thứ Hai 2026-11-09 07:00; phòng R1 có `capacity = 6`.

| ID | Given | When | Then |
|---|---|---|---|
| AC-001-1 | phòng R1 trống | M1 đặt 09:00 đến 11:00, 4 người | tạo `Booking` `CONFIRMED`, thời lượng 120 phút |
| AC-001-2 | R1 đã có booking 09:00 đến 11:00 | M2 đặt 10:00 đến 12:00 | lỗi `BOOKING_OVERLAP`, không tạo booking |
| AC-001-3 | không | M1 đặt 17:00 đến 19:00 | lỗi `OUTSIDE_OPENING_HOURS` |
| AC-001-4 | không | M1 đặt 08:00 đến 12:30 (270 phút) | lỗi `DURATION_TOO_LONG` |
| AC-001-5 | M1 đã có 3 booking sắp tới (08:00, 10:00, 12:00, mỗi lượt 1 giờ) | M1 đặt 14:00 đến 15:00 | lỗi `QUOTA_EXCEEDED` |
| AC-001-6 | không | M1 đặt 09:00 đến 10:00 với 7 người | lỗi `CAPACITY_EXCEEDED` |
| AC-001-7 | R1 đã có booking 09:00 đến 10:00 | M2 đặt 10:00 đến 11:00 | tạo `Booking` `CONFIRMED` |
| AC-001-8 | không | M1 đặt 06:00 đến 07:00 | lỗi `START_IN_PAST` |

## Dependencies
Entity: `Room`, `Booking`, `Member`; value object `TimeSlot` (xem [entities.md](../entities.md)).

## Lịch sử
- 2026-11-02: tạo bản đầu (AC-001-1 đến AC-001-8).
