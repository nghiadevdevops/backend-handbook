# Chapter 9. Running a Spec-Driven team day to day

## 1. Scenario

Ba tháng sau khi bắt đầu, RoomBook có 12 UC, 5 dev. Spec bắt đầu lệch code; PR spec nằm chờ cả tuần; người mới không biết đọc gì trước. SDD không hỏng ở kỹ thuật mà ở vận hành: ai viết, ai duyệt, đo gì, cập nhật khi nào.

## 2. Roles

| Vai trò | Việc chính trong SDD | Duyệt cái gì |
|---|---|---|
| PO / BA | Làm rõ "cái gì" và "vì sao": BR, UC, AC | BR, AC |
| Tech lead | Giữ entity, architecture, ADR, boundary | Entity, UC (feasibility), PR architecture |
| Dev | Viết test từ AC, dẫn AI implement, cập nhật spec khi phát hiện thiếu | PR code của nhau |
| QA | Soi spec: boundary, error, AC thiếu; mở rộng test | AC coverage |
| Engineering manager | Giữ nhịp, đo metric, bảo vệ thời gian review spec | Quy trình |

Team nhỏ (3 người) một người đội nhiều mũ: bắt buộc giữ *hai cặp mắt* cho spec (người viết khác người duyệt) dù cùng một người có thể vừa là dev vừa là BA.

## 3. Repo structure

Giữ spec **cùng repo với code** (lab của sách):

```text
specs/        # source of truth về requirement
src/          # code
tests/        # test theo AC
CLAUDE.md     # quy tắc làm việc cho AI
```

Một repo cho spec và code giúp một PR có thể chứa cả hai khi thay đổi nhỏ, và traceability bằng grep đơn giản. Với nhiều service, mỗi service có `specs/` riêng; spec liên service đặt ở repo chung hoặc `docs/`.

## 4. SDD-style code review

Năm quy tắc (diễn giải lại):

1. **Spec PR tách khỏi code PR** khi thay đổi lớn. Người duyệt spec (PO/BA) không phải đọc diff code.
2. **Code PR link UC** (và AC liên quan). PR template ở phụ lục B có ô này.
3. **Review spec trước, code sau.** Nếu spec chưa được duyệt, code PR không merge.
4. **Test map AC.** Reviewer kiểm tra mỗi AC mới có test tên `test_ac_<uc>_<n>_...`; script `check-ac-coverage.sh` chạy trong CI.
5. **Hỏi "AI quyết hay bạn quyết?"** Với mọi constant, error branch hoặc constraint mà spec không nêu: phải ghi vào spec hoặc xóa.

Reviewer cũng nên đặc biệt nghi ngờ: test bị sửa cùng lúc với code, spec bị sửa trong PR "chỉ code", phần thay đổi lớn hơn phạm vi UC.

## 5. Common mistakes

| Lỗi | Biểu hiện | Cách chữa |
|---|---|---|
| Spec lỗi thời | UC nói 3, code là 5 | PR sửa hành vi bắt buộc đụng spec; kiểm tra traceability |
| Spec quá dài, không ai đọc | PR spec 40 trang | UC nhỏ, review được trong 10 đến 15 phút |
| AI làm quá phạm vi | thêm tính năng không có UC | "out of scope" trong BR; checklist PR |
| Duyệt cho có | spec merge trong 5 phút | người duyệt phải trả lời một câu hỏi cụ thể (ví dụ boundary nào chưa có AC) |
| Test sửa theo code | test pass nhưng AC sai | PR sửa test phải sửa AC hoặc giải thích |
| Mỗi người một cấu trúc | thư mục khác nhau | CLAUDE.md ghi cấu trúc; một template |

## 6. Metrics: knowing whether SDD helps

Chọn vài metric, đo theo xu hướng, đừng biến thành KPI cá nhân:

| Metric | Cách đo | Tín hiệu tốt |
|---|---|---|
| Thời gian từ spec duyệt tới merge | timestamp PR | giảm hoặc ổn định |
| Số lần làm lại do hiểu sai requirement | gắn nhãn issue `requirement-misread` | giảm |
| Tỉ lệ AC có test | `check-ac-coverage.sh` | gần 100% |
| Lỗi production quy về requirement mơ hồ | postmortem | giảm |
| Tỉ lệ PR code có link UC | quét PR | gần 100% |

Số lỗi hay tốc độ dòng code không phải metric tốt cho SDD (dễ bị thao túng và không đo đúng giá trị).

## 7. The 30/60/90-day roadmap

Đây là gợi ý, không phải chuẩn; điều chỉnh theo cỡ team.

| Giai đoạn | Việc | Tiêu chí qua |
|---|---|---|
| Ngày 1 đến 30: thử nhỏ | Một nhóm, một tính năng mới (không phải toàn bộ). Chọn template, cấu trúc `specs/`, viết CLAUDE.md | Một tính năng xong; team có feedback cụ thể |
| Ngày 31 đến 60: mở rộng | Thêm 2 đến 3 tính năng hoặc nhóm; bật PR template, script AC coverage trong CI; thử một tool (chương 6) trên một use case thật | Metric ở mục 6 có số đầu tiên |
| Ngày 61 đến 90: quyết định | Xem lại metric và feedback; giữ, đổi, hay bỏ từng thực hành | Quyết định ghi thành ADR |

Chấp nhận kết quả "bỏ phần X": SDD là công cụ, không phải mục tiêu.

## 8. A typical day

- Sáng: dev nhận UC đã duyệt, đọc AC, nhờ AI liệt kê tình huống chưa có AC (`/spec-review`).
- Viết test từ AC, chạy trong Docker; AI sinh code tới khi test pass.
- Phát hiện thiếu rule: dừng, hỏi PO, sửa spec trong PR riêng.
- Chiều: review PR của đồng đội theo năm quy tắc; kiểm tra link UC và test ↔ AC.

## 9. Trade-offs

- Chi phí review spec là thật; bù lại bằng việc giảm làm lại. Nếu team không ghi nhận làm lại, sẽ thấy SDD chỉ có chi phí.
- Spec trong repo dễ sửa nhưng cũng dễ bị sửa tùy tiện; cần CODEOWNERS hoặc quy ước duyệt (ví dụ yêu cầu PO duyệt thay đổi dưới `specs/`).
- Quy trình nặng với team rất nhỏ; giữ tối thiểu: BR mỏng, UC + AC, test map AC.

## 10. Pitfalls

- Biến metric thành thước đo cá nhân.
- Để một người giữ toàn bộ spec; khi họ nghỉ, spec chết.
- Bắt AI "tự cập nhật spec sau khi code": nó sẽ ghi lại những gì nó làm chứ không phải những gì cần làm.
- Không có người sở hữu BR.

## 11. Summary

1. Mỗi vai trò có việc và thẩm quyền duyệt rõ ràng; spec luôn có hai cặp mắt.
2. Spec và code cùng repo; traceability bằng quy ước tên.
3. Review: spec trước code, PR link UC, test map AC, hỏi "AI quyết hay bạn quyết?".
4. Đo vài metric theo xu hướng; tránh metric dễ thao túng.
5. Lộ trình 30/60/90: thử, mở rộng, quyết định; được phép bỏ.

## 12. Self-check

1. Ai nên duyệt AC "hủy trước 120 phút là miễn phí"?
2. Vì sao PR sửa test cùng lúc với code là tín hiệu cần soi?
3. Metric nào đo được AC coverage bằng script?
4. Cuối ngày 90, kết luận "bỏ SDD cho tính năng nhỏ" có chấp nhận được không?

<details><summary>Answer</summary>

1. PO/BA (business owner), có QA kiểm tra coverage.
2. AI có thể chỉnh test cho khớp code sai, làm mất tác dụng bảo vệ.
3. Tỉ lệ AC có test, qua `check-ac-coverage.sh`.
4. Có, nếu ghi lại thành quyết định và vẫn giữ AC với thay đổi có business rule.
</details>
