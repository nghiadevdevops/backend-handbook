# Thuật ngữ dự án RoomBook

| Từ | Nghĩa duy nhất trong dự án này |
|---|---|
| Member | Nhân viên có tài khoản, có thể đặt phòng |
| Room | Một phòng họp vật lý |
| Booking | Một lượt đặt một phòng cho một khung giờ |
| TimeSlot | Khoảng thời gian nửa mở `[start_at, end_at)` |
| Upcoming booking | `Booking` `CONFIRMED` có `start_at` sau thời điểm hiện tại |
| Late cancel | Hủy khi còn dưới 120 phút trước `start_at` |

Không dùng "reservation", "meeting" hay "slot" để chỉ `Booking` trong spec và code.
