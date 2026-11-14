# ADR-001: Dùng ports và adapters cho kho lưu trữ và đồng hồ

- Trạng thái: Accepted
- Ngày: 2026-11-03

## Bối cảnh
Use case cần đọc/ghi `Booking` và biết "bây giờ". Test phải chạy nhanh, không cần database, và kiểm soát được thời gian.

## Quyết định
`application/` chỉ phụ thuộc các port trong `src/ports/` (`RoomRepository`, `BookingRepository`, `Clock`). Implementation nằm ở `src/adapters/` (hiện có `in-memory.ts`). Adapter database và SMTP sẽ thêm sau, không đổi `application/` hay `domain/`.

## Hệ quả
- Test acceptance dùng adapter in-memory và `FixedClock`.
- Thêm adapter mới không cần sửa spec UC, chỉ cần chạy lại bộ test acceptance với adapter đó.
