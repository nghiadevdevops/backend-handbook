# Chapter 10. When not to use SDD, and where to go next

## 1. Scenario

Sau khi hiểu SDD, có xu hướng áp cho mọi thứ: đổi màu nút cũng phải có UC. Đó là lúc SDD thành gánh nặng và người ta bỏ cả những phần có ích.

## 2. When not to use it (or to use it very lightly)

| Tình huống | Vì sao | Thay bằng |
|---|---|---|
| Prototype bỏ đi, spike 1 giờ | spec đắt hơn thứ bị vứt | vibe coding có chủ đích; đặt hạn "vứt sau X" |
| Script cá nhân | không ai khác đọc | prompt tốt là đủ |
| Sửa lỗi nhỏ, đổi chữ, đổi màu | AC một dòng là đủ | issue + một regression test |
| Khám phá sản phẩm, chưa biết cần gì | lock requirement quá sớm | BR mỏng + thử nghiệm; viết spec khi đã hiểu |
| Domain thay đổi từng giờ | spec lỗi thời nhanh hơn viết | giữ ở mức nguyên tắc và test |
| Team 1 người, dự án nhỏ | không cần nhiều tầng | gộp BR vào UC, giữ AC và test |

## 3. When to use it

- Có business rule thật và người dùng thật.
- Nhiều người hoặc nhiều session AI cùng đụng một vùng code.
- Cần traceability, audit, hoặc bảo trì dài hạn.
- Thay thế hệ thống cũ (brownfield) và phải giữ hành vi.

## 4. Misconceptions

1. **"SDD nghĩa là viết spec rồi AI làm hết."** Con người vẫn quyết business rule, review code và chịu trách nhiệm.
2. **"Spec đúng thì code đúng."** Chỉ khi test chứng minh. Spec thiếu boundary vẫn sinh code sai.
3. **"SDD cần một tool cụ thể."** Chương 6 cho thấy có cả cách không cần tool.
4. **"SDD là waterfall."** Chương 1: slice nhỏ, lặp ngắn.
5. **"Spec dài thì tốt."** Spec tốt là spec kiểm thử được và vừa đủ.
6. **"Mọi tool đều bảo bạn viết `UC-xxx`."** Mã UC là quy ước của team hoặc AIUP; Spec Kit và OpenSpec có cách đặt tên riêng.

## 5. How the engineer's role changes

Khi implementation rẻ đi, phần đắt chuyển sang: hiểu vấn đề, diễn đạt chính xác, thiết kế boundary, kiểm chứng, và quyết định. Kỹ năng tăng giá trị: viết AC có boundary, domain modeling, đọc code AI nhanh và hoài nghi, thiết kế test. Đây là nhận định của tôi dựa trên thực hành, không phải số liệu đã kiểm chứng.

## 6. Pitfalls

- Áp SDD đầy đủ cho mọi việc rồi bỏ cuộc vì quá nặng.
- Bỏ SDD vì một lần spec lỗi thời, không tìm ra nguyên nhân (không ai sở hữu spec).
- Tin vào tool thay cho thực hành: tool không thay được việc hỏi business stakeholder.

## 7. Further reading (verified to exist)

- Den Delimarsky, "Spec-driven development with AI: Get started with a new open source toolkit", GitHub Blog, 02/09/2025. Giới thiệu Spec Kit.
- Den Delimarsky, "Diving Into Spec-Driven Development With GitHub Spec Kit", Microsoft Developer Blog, 15/09/2025. **Một bài blog** (không phải series); lưu ý lệnh trong bài là bản cũ.
- Tài liệu chính thức: Spec Kit (`github.com/github/spec-kit`, trang docs `github.github.io/spec-kit`), OpenSpec (`github.com/Fission-AI/OpenSpec`, thư mục `docs/`), Kiro (`kiro.dev/docs`), Claude Code (`code.claude.com/docs`), AIUP marketplace (`github.com/ai-unified-process/marketplace`).
- Alistair Cockburn, bài "Hexagonal architecture" (khoảng 2005) trên trang cá nhân của ông.
- Eric Evans, *Domain-Driven Design* (2003); Vaughn Vernon, *Implementing Domain-Driven Design* (2013).
- Tweet gốc của Andrej Karpathy ngày 02/02/2025 về "vibe coding".

## 8. Summary

1. SDD không dành cho mọi việc; prototype bỏ đi, script cá nhân, sửa nhỏ thì nhẹ hơn.
2. Dùng khi có business rule thật, nhiều người, cần traceability hoặc thay thế hệ thống cũ.
3. Spec không thay test và con người.
4. Giá trị kỹ sư dịch chuyển sang hiểu, đặc tả, kiểm chứng.
5. Thử nhỏ, đo, quyết định.

## 9. Self-check

1. Hai trường hợp nên bỏ qua UC và chỉ dùng AC + test?
2. Vì sao "spec đúng thì code đúng" là hiểu nhầm?
3. Bài của Microsoft về Spec Kit là gì, của ai?
4. Chọn: dự án khám phá sản phẩm, chưa rõ nhu cầu. Làm gì?

<details><summary>Answer</summary>

1. Sửa lỗi nhỏ, đổi chữ/màu.
2. Spec có thể thiếu boundary hoặc mơ hồ; chỉ test chạy được mới chứng minh.
3. Một bài blog trên Microsoft Developer Blog của Den Delimarsky (15/09/2025), không phải series.
4. BR mỏng, prototype vứt đi, viết spec thật sau khi hiểu.
</details>
