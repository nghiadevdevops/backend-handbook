---
name: spec-review
description: Review a use case spec in specs/use-cases for missing acceptance criteria, ambiguous terms and inconsistencies with specs/entities.md. Use when a UC spec is created or changed.
disable-model-invocation: true
argument-hint: [UC-id, ví dụ UC-001]
---

Review use case $ARGUMENTS trong `specs/use-cases/`:

1. Mỗi dòng trong bảng Exceptions có ít nhất một AC tương ứng không? Liệt kê dòng còn thiếu.
2. Mỗi AC có Given, When, Then cụ thể (có số liệu) không?
3. Tên field và thuật ngữ có khớp `specs/entities.md` và `specs/glossary.md` không?
4. Có AC nào mâu thuẫn với ràng buộc trong BR liên quan không?
5. `specs/traceability.md` đã có đủ dòng cho mọi AC chưa?

Chỉ báo cáo vấn đề, không sửa file.
