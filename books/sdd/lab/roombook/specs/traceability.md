# Ma trận truy vết

| BR | UC | AC | Test (tests/acceptance/) | Code chính |
|---|---|---|---|---|
| BR-001 | UC-001 | AC-001-1 | `uc001-create-booking.test.ts::test_ac_001_1_creates_confirmed_booking` | `application/create-booking.ts` |
| BR-001 | UC-001 | AC-001-2 | `::test_ac_001_2_rejects_overlapping_slot` | `TimeSlot.overlaps` |
| BR-001 | UC-001 | AC-001-3 | `::test_ac_001_3_rejects_outside_opening_hours` | |
| BR-001 | UC-001 | AC-001-4 | `::test_ac_001_4_rejects_duration_over_240_minutes` | |
| BR-001 | UC-001 | AC-001-5 | `::test_ac_001_5_rejects_fourth_upcoming_booking` | |
| BR-001 | UC-001 | AC-001-6 | `::test_ac_001_6_rejects_attendees_over_capacity` | |
| BR-001 | UC-001 | AC-001-7 | `::test_ac_001_7_allows_back_to_back_bookings` | `TimeSlot.overlaps` (nửa mở) |
| BR-001 | UC-001 | AC-001-8 | `::test_ac_001_8_rejects_start_in_past` | |
| BR-001 | UC-002 | AC-002-1 | `uc002-cancel-booking.test.ts::test_ac_002_1_cancel_at_least_120_minutes_before_is_free` | `Booking.cancel` |
| BR-001 | UC-002 | AC-002-2 | `::test_ac_002_2_cancel_under_120_minutes_marks_late` | `Booking.cancel` |
| BR-001 | UC-002 | AC-002-3 | `::test_ac_002_3_only_owner_can_cancel` | `Booking.cancel` |
| BR-001 | UC-002 | AC-002-4 | `::test_ac_002_4_cannot_cancel_started_booking` | `Booking.cancel` |
| BR-001 | UC-002 | AC-002-5 | `::test_ac_002_5_cancelling_twice_is_rejected` | `Booking.cancel` |

Tổng: 1 BR, 2 UC, 13 AC (8 + 5), 13 test.

Quy ước tên test: `test_ac_<uc>_<n>_<mô tả>` ứng với `AC-<uc>-<n>`.
