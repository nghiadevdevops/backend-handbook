# Lab: RoomBook

Repo mẫu cho cuốn SDD. Xem `roombook/CLAUDE.md` để biết quy tắc làm việc.

Đường đi một use case hoàn chỉnh (UC-001):

`specs/business-requirements/BR-001-...` → `specs/use-cases/UC-001-create-booking.md` → `specs/entities.md` → AC-001-1..8 → `tests/acceptance/uc001-create-booking.test.ts` (`test_ac_001_n_...`) → `src/application/create-booking.ts`.

UC-002 (hủy đặt phòng) theo cùng cách với 5 AC. Traceability matrix đầy đủ: `roombook/specs/traceability.md` (13 AC, 13 test).

Bài tập gợi ý: thêm AC-001-9 cho `ROOM_NOT_FOUND`; thêm AC boundary 240 phút; viết UC-003 (xem lịch phòng) theo template phụ lục A rồi chạy skill `/spec-review UC-003` trong Claude Code.

Lệnh chạy: xem `../README.md`, mục "Cách chạy lab".
