# Entity Model

| Loại DDD | Tên | Ghi chú |
|---|---|---|
| Entity (aggregate root) | `Booking` | giữ quy tắc hủy; tham chiếu `Room`, `Member` qua id |
| Entity (aggregate root) | `Room` | |
| Entity | `Member` | |
| Value object | `TimeSlot` | `start_at`, `end_at`; bất biến, không có id |

## Booking
| Field | Kiểu | Ràng buộc |
|---|---|---|
| `booking_id` | string | định danh, duy nhất |
| `room_id` | string | tham chiếu `Room.room_id` |
| `member_id` | string | tham chiếu `Member.member_id`; chủ lượt đặt |
| `slot` | `TimeSlot` | `start_at` < `end_at`, cùng ngày |
| `attendee_count` | int | không lớn hơn `Room.capacity` |
| `status` | enum | `CONFIRMED` hoặc `CANCELLED` |
| `late_cancel` | bool | mặc định `false`; `true` khi hủy trong vòng dưới 120 phút trước `start_at` |

## TimeSlot (value object)
| Field | Kiểu |
|---|---|
| `start_at` | datetime |
| `end_at` | datetime |

Khoảng thời gian nửa mở `[start_at, end_at)`. Quan hệ chồng lấn: `a.start_at < b.end_at` và `b.start_at < a.end_at`.

## Room
| Field | Kiểu | Ràng buộc |
|---|---|---|
| `room_id` | string | định danh |
| `name` | string | |
| `capacity` | int | lớn hơn 0 |

## Member
| Field | Kiểu |
|---|---|
| `member_id` | string |
| `full_name` | string |
| `email` | string |

## Quan hệ
`Member` 1 - n `Booking` n - 1 `Room`.
