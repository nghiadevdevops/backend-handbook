# Chương 6. So sánh và cách chọn workflow

## Vấn đề

Ba chương trước mô tả bốn mô hình. Câu hỏi thực tế là: **team của tôi nên dùng cái nào?** Câu trả lời phụ thuộc vào cách bạn phát hành, không phải vào sở thích.

## Hai câu hỏi quyết định

1. **Bạn kiểm soát thời điểm người dùng nhận code không?** Web service, API nội bộ: có (deploy khi muốn). Mobile app, thư viện, phần mềm cài ở khách: không (người dùng tự nâng cấp, hoặc store duyệt).
2. **Có bao nhiêu version phải sống song song?** Một (production hiện tại) hay nhiều (1.x, 2.x cùng nhận fix)?

Hai câu này phân loại gần hết trường hợp.

## Bảng chọn theo loại sản phẩm

| Loại sản phẩm | Version song song | Workflow đề xuất | Ghi chú |
|---|---|---|---|
| Web service/API deploy liên tục | 1 | **Trunk-based** hoặc GitHub Flow | squash merge, feature flag, tag mỗi deploy |
| Web app nhiều tenant, có staging bắt buộc | 1 | GitHub Flow + promote artifact | tránh environment branch nếu được |
| Mobile app | 1-3 (bản cũ còn người dùng) | Trunk + release branch cắt muộn, hoặc Git Flow rút gọn | hotfix cho bản đang chạy, feature flag remote |
| Thư viện/SDK/CLI | nhiều major | Trunk + `release/vN.x` cho bản cũ, hoặc Git Flow | SemVer, cherry-pick fix |
| Phần mềm on-premise | nhiều | Git Flow hoặc GitLab Flow release branches | QA tách biệt, support branch |
| Monorepo nhiều service | 1 mỗi service | Trunk-based | CI theo path (Chương 10) |

## Bảng theo quy mô và tần suất

| Yếu tố | Nghiêng về trunk/GitHub Flow | Nghiêng về Git Flow/release branch |
|---|---|---|
| Team size | 2-50, có CI tốt | đông, release do bộ phận riêng điều phối |
| Tần suất release | nhiều lần mỗi ngày đến mỗi tuần | mỗi tháng/quý |
| Test tự động | mạnh | yếu, cần giai đoạn QA thủ công |
| Rollback | feature flag hoặc redeploy bản trước | không thể (đã nằm trên thiết bị người dùng) |
| Yêu cầu compliance (audit trail theo release) | tag + changelog đủ | release branch có chữ ký phê duyệt |

## Khuyến nghị rõ ràng

**Với web service hoặc API deploy liên tục (trường hợp phổ biến nhất của người đọc TS/Go backend): dùng trunk-based development với short-lived branch và squash merge qua PR.**

Cấu hình cụ thể:
- Một nhánh dài hạn `main`, được bảo vệ bằng ruleset (Chương 8).
- Branch sống dưới 2 ngày, PR dưới ~400 dòng thay đổi.
- Squash merge là phương thức duy nhất; tên PR theo Conventional Commits (Chương 7).
- CI bắt buộc, dưới 10 phút; merge queue khi nhiều người merge cùng lúc.
- Feature flag cho thay đổi lớn; deploy tự động từ `main`; tag mỗi release (Chương 9).
- Release branch chỉ cắt khi thật sự cần vá version cũ.

**Với thư viện/CLI**: trunk (`main`) cho phát triển, tag `vX.Y.Z` để release, `release/vN.x` chỉ tạo khi cần backport.

**Với mobile**: trunk + cắt `release/x.y` tại ngày code freeze, chỉ nhận fix đã có trên trunk (upstream first).

## Cách chuyển từ Git Flow sang trunk

1. Đo trước: tuổi trung bình của feature branch, thời gian merge, số conflict mỗi release.
2. Cải thiện CI (nhanh, ổn định) trước khi đổi nhánh.
3. Giảm tuổi nhánh: yêu cầu PR nhỏ, bắt đầu dùng feature flag.
4. Cho `develop` merge vào `main`, ngừng tạo release branch trừ khi cần; để `develop` làm alias đọc-chỉ rồi xóa.
5. Đo lại bằng DORA và tuổi PR.

## Cạm bẫy

- Chọn workflow theo "công ty lớn nào đó dùng". Họ có CI và hạ tầng khác bạn.
- Trộn: `develop` tồn tại nhưng ai cũng merge thẳng vào `main`.
- Quy trình quá nặng cho team 3 người, hoặc quá lỏng cho team 30 người.
- Không ghi workflow thành văn bản (Chương 13), mỗi người một kiểu.

## Tóm tắt

- Chọn theo hai câu hỏi: có kiểm soát thời điểm người dùng nhận code không, và có bao nhiêu version song song.
- Web/API deploy liên tục: trunk-based, squash, feature flag.
- Thư viện, mobile, on-premise: trunk cộng release branch, hoặc Git Flow khi nhiều version.
- Chuyển workflow là thay đổi văn hóa, cần CI nhanh và PR nhỏ trước.

## Câu hỏi tự kiểm tra

1. Hai câu hỏi quyết định workflow là gì?
2. Khuyến nghị cho API deploy liên tục?
3. Vì sao mobile thường cần release branch?
4. Bước đầu tiên khi chuyển từ Git Flow sang trunk?

<details><summary>Đáp án</summary>

1. Có kiểm soát thời điểm người dùng nhận code không, và có bao nhiêu version phải hỗ trợ song song.
2. Trunk-based, short-lived branch, squash merge, CI bắt buộc, feature flag.
3. Bản trên store cần thời gian review và người dùng giữ bản cũ; cần ổn định một bản và vá riêng.
4. Đo hiện trạng và cải thiện CI, trước khi đổi cấu trúc nhánh.

</details>
