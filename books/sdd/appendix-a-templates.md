# Appendix A. BR, UC, Entity, AC templates

Bản dùng ngay. Ví dụ đã điền: `lab/roombook/specs/`. Đặt tên file: `BR-001-ten-ngan.md`, `UC-001-ten-ngan.md` (chữ thường, gạch nối). Mã là quy ước của team.

## A.1. Business Requirement (`specs/business-requirements/BR-XXX-ten.md`)

````markdown
# BR-XXX: <Tên>

## Metadata
- Trạng thái: Draft | Approved | Superseded
- Chủ sở hữu (business owner): <tên>
- Cập nhật: <YYYY-MM-DD>

## Bối cảnh
<Tình hình hiện tại và nỗi đau, bằng số liệu nếu có.>

## Mục tiêu
<Một câu: ai đạt được gì.>

## Chỉ số thành công
| Chỉ số | Hiện tại | Mục tiêu sau <N> tuần |
|---|---|---|

## Trong phạm vi (In scope)
-

## Ngoài phạm vi (Out of scope)
-

## Use case liên quan
- [UC-XXX](../use-cases/UC-XXX-ten.md)

## Ràng buộc
<Con số, luật, tuân thủ. Mỗi ràng buộc phải truy được tới một dòng Exceptions hoặc AC.>

## Open Questions
- <câu hỏi> (người quyết, hạn)

## Lịch sử
- <ngày>: <thay đổi>
````

## A.2. Use Case (`specs/use-cases/UC-XXX-ten.md`)

````markdown
# UC-XXX: <Tên động từ + danh từ>

## Metadata
- BR: [BR-XXX](...)
- Trạng thái: Draft | Approved
- Code: `src/application/<file>.ts`
- Test: `tests/acceptance/ucXXX-<ten>.test.ts`

## Actor
## Trigger
## Preconditions
## Main Flow
1.
## Alternative Flows
- A1:
## Exceptions
| Mã lỗi | Điều kiện |
|---|---|

## Postconditions

## Acceptance Criteria
<Nêu quy ước thời gian/dữ liệu mẫu dùng chung.>
| ID | Given | When | Then |
|---|---|---|---|
| AC-XXX-1 | | | |

## Dependencies
<Entity, port, UC khác.>

## Lịch sử
````

## A.3. Entity Model (`specs/entities.md`)

````markdown
# Entity Model

| Loại DDD | Tên | Ghi chú |
|---|---|---|
| Entity (aggregate root) | | |
| Entity | | |
| Value object | | |

## <TênEntity>
| Field | Kiểu | Ràng buộc |
|---|---|---|
| `<id>` | string | identity |

## <TênValueObject> (value object)
| Field | Kiểu |
|---|---|

## Quan hệ
<A 1 - n B ...>
````

Mỗi field xuất hiện một lần, đúng một tên, trong toàn bộ spec và code.

## A.4. Acceptance Criteria (table form, inside the UC)

Quy tắc viết:

1. Mỗi dòng Exceptions có ít nhất một AC.
2. Có AC cho boundary value (đúng bằng giới hạn, và vượt một đơn vị).
3. Given/When/Then có **số liệu cụ thể**; số liệu phải cộng đúng (ví dụ 08:00 đến 12:30 là 270 phút).
4. Một AC kiểm tra một điều.
5. Tên test: `test_ac_<uc>_<n>_<mô_tả_ngắn>` ứng với `AC-<uc>-<n>`.

Dạng Gherkin (nếu bạn dùng công cụ BDD) cũng được, miễn là nhất quán:

```gherkin
Scenario: AC-001-7 hai booking liền nhau
  Given phòng R1 đã có booking 09:00-10:00
  When  M2 đặt R1 10:00-11:00
  Then  Booking được tạo với status CONFIRMED
```

## A.5. Traceability matrix (`specs/traceability.md`)

| BR | UC | AC | Test | Code chính |
|---|---|---|---|---|

Xem bản đã điền trong lab (13 dòng).
