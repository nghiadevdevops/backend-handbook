# BR-001: Đặt phòng họp tự phục vụ

## Metadata
- Trạng thái: Approved
- Chủ sở hữu (business owner): Chị Hà, trưởng bộ phận Văn phòng
- Cập nhật: 2026-11-02

## Bối cảnh
Văn phòng có 3 phòng họp. Hiện việc đặt phòng qua nhóm chat, thường xuyên có hai nhóm cùng vào một phòng. Lễ tân mất khoảng 1 giờ mỗi ngày để phân xử.

## Mục tiêu
Nhân viên tự đặt và hủy phòng họp trong hệ thống RoomBook mà không cần nhờ lễ tân.

## Chỉ số thành công
| Chỉ số | Hiện tại | Mục tiêu sau 8 tuần |
|---|---|---|
| Số vụ trùng phòng mỗi tuần | khoảng 6 | 0 |
| Thời gian lễ tân dành cho việc xếp phòng mỗi ngày | khoảng 60 phút | dưới 10 phút |

## Trong phạm vi (In scope)
- Đặt phòng theo khung giờ trong giờ làm việc (08:00 đến 18:00).
- Hủy đặt phòng, có phân biệt hủy muộn.
- Giới hạn số lượt đặt sắp tới của mỗi nhân viên.

## Ngoài phạm vi (Out of scope)
- Đặt phòng lặp lại (hằng tuần).
- Thanh toán hay tính phí.
- Tích hợp lịch Outlook (xem Open Questions).

## Use case liên quan
- [UC-001 Tạo đặt phòng](../use-cases/UC-001-create-booking.md)
- [UC-002 Hủy đặt phòng](../use-cases/UC-002-cancel-booking.md)

## Ràng buộc
- Tối đa 240 phút mỗi lượt đặt.
- Tối đa 3 lượt đặt sắp tới (đã xác nhận, chưa bắt đầu) cho mỗi nhân viên.
- Hủy trước giờ bắt đầu ít nhất 120 phút là hủy miễn phí; muộn hơn bị đánh dấu `late_cancel`.

## Open Questions
- Có cần đồng bộ lịch Outlook ở phiên bản 1 không? (Chị Hà quyết định trước 2026-11-20)

## Lịch sử
- 2026-11-02: tạo bản đầu.
