# RoomBook

Hệ thống đặt phòng họp nội bộ. Dự án mẫu của sách SDD (lab).

## Cấu trúc
- `specs/`: nguồn sự thật về yêu cầu. BR (`business-requirements/`), UC (`use-cases/`), `entities.md`, `glossary.md`, `traceability.md`, `decisions/` (ADR).
- `src/`: `domain/` (entity, value object), `application/` (use case), `ports/` (interface), `adapters/` (implementation).
- `tests/acceptance/`: mỗi AC một test (`tests/acceptance/*.test.ts`, `node:test`), tên `test_ac_<uc>_<n>_...`.

## Quy tắc làm việc
- Đọc UC liên quan trong `specs/use-cases/` trước khi sửa code. Không tự thêm hành vi không có trong spec; nếu thấy thiếu, dừng và hỏi.
- Đổi hành vi: sửa spec (UC và AC) trước, rồi test, rồi code. Cập nhật mục "Lịch sử" của UC và `specs/traceability.md`.
- `domain/` và `application/` không import từ `adapters/`.
- Mã lỗi nghiệp vụ lấy từ bảng Exceptions của UC; không đặt tên mới tùy ý.
- Tên field theo `specs/entities.md` (ví dụ `start_at`, `end_at`, không dùng `from_date`); giữ dạng snake_case để map 1-1 với spec.

## Lệnh
- Chạy test: `docker run --rm -v "$PWD:/w" -w /w node:lts sh scripts/verify.sh` (typecheck, 13 test, AC coverage; chạy trong Docker, không chạy trên máy host).
