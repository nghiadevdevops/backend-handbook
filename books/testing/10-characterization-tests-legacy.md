# Chương 10. Characterization test, snapshot và approval test cho legacy

## 1. Tình huống

Bạn thừa kế `calcShippingFee`: không tài liệu, không test, vài branch khó hiểu, và phải sửa cho một khu vực giao hàng mới. Michael Feathers (*Working Effectively with Legacy Code*) định nghĩa legacy code là "code không có test". Muốn sửa an toàn cần test trước, nhưng bạn chưa biết hành vi đúng là gì. Giải pháp: **ghi lại hành vi hiện tại**, đúng hay sai, rồi mới sửa.

## 2. Characterization test

Quy trình (theo Feathers):

1. Đưa code vào một test harness.
2. Viết một assertion **cố tình sai** để xem code thực sự trả gì.
3. Sửa expected thành giá trị thật đã quan sát được.
4. Lặp lại cho các branch/biên đáng quan tâm.

Test này không nói "đúng", chỉ nói "đang như vậy". Mục đích là báo động khi hành vi đổi. Nếu sau này phát hiện hành vi hiện tại là bug, bạn sửa test chủ ý và ghi rõ lý do.

## 3. Ví dụ trong lab

`lab/src/legacy/shipping-fee.ts` (cố ý khó đọc):

```ts
export function calcShippingFee(weightGram: number, zone: string, express: boolean): number {
  let fee = 15000;
  if (weightGram > 500) {
    fee += Math.ceil((weightGram - 500) / 250) * 5000;
  }
  if (zone === 'HN' || zone === 'HCM') {
    fee -= 5000;
  } else if (zone === 'ISLAND') {
    fee *= 3;
  }
  if (express) {
    fee = Math.round(fee * 1.5);
  }
  if (weightGram > 20000) {
    fee = 0; // oversize: handled by another department
  }

  return fee;
}
```

Và characterization test (`lab/tests/characterization/shipping-fee.characterization.test.ts`):

```ts
it.each([
  ['light, inner city HN', 300, 'HN', false, 10_000],
  ['exactly 500g, other province', 500, 'OTHER', false, 15_000],
  ['501g jumps one step', 501, 'OTHER', false, 20_000],
  ['1000g, HCM', 1000, 'HCM', false, 20_000],
  ['island multiplies by 3', 300, 'ISLAND', false, 45_000],
  ['express multiplies by 1.5', 300, 'HN', true, 15_000],
  ['express rounds', 750, 'OTHER', true, 30_000],
  ['over 20kg is 0', 20_001, 'HN', false, 0],
])('pins current behaviour: %s', (_name, grams, zone, express, expected) => {
  expect(calcShippingFee(grams, zone, express)).toBe(expected);
});
```

**Chuyện thật khi viết lab này (và lặp lại ở bản TypeScript):** lần đầu mình *đoán* ca `1000g, HCM` là `15_000`. Vitest báo:

```
AssertionError: expected 20000 to be 15000 // Object.is equality
- Expected
+ Received
- 15000
+ 20000
```

Tính tay: 15.000 + ceil(500/250) x 5.000 = 25.000, trừ 5.000 vì HCM = 20.000. Mình đoán sai, code mới là sự thật. Đây chính là bước 2-3 của quy trình: đừng đoán, hãy chạy và quan sát. Sửa expected thành `20_000` và test xanh.

Quan sát đáng chú ý khi đọc bảng: ca `over 20kg is 0` cho phí bằng 0, có thể là bug thật (miễn phí vận chuyển cho hàng nặng?) hay implicit business rule (bộ phận khác xử lý). Characterization test **ghi nhận** nó và buộc ta hỏi nghiệp vụ trước khi đổi.

Một chi tiết riêng khi port sang JavaScript: `Math.round` làm tròn nửa lên (về phía +vô cực), còn `round()` ở ngôn ngữ khác có thể làm tròn nửa ra xa số 0. Với phí không âm hai cách trùng nhau, nhưng nếu một ngày `fee` có thể âm (giảm giá lớn hơn phí) thì kết quả `Math.round(-0.5)` là `-0`, và `expect(-0).toBe(0)` **đỏ** vì `toBe` dùng `Object.is`. Đó là loại hành vi mà characterization test nên pin, không nên "sửa cho đẹp".

Chọn ca ở đâu: tại biên (500/501g, 20.000/20.001g), một ca mỗi branch, và các combination (express x zone). Công cụ mutation testing (chương 11) đo xem bạn đã cover đủ branch chưa.

## 4. Seam: chỗ để chèn test vào legacy

Với code khó test (gọi `new`, import singleton, biến global, `Date.now()`), Feathers đề xuất tìm **seam**: điểm thay đổi hành vi mà không sửa in-place. Ví dụ: bọc lời gọi vào một interface rồi truyền vào qua constructor hoặc parameter; tách phần pure ra khỏi phần I/O (Humble Object). Với module ES, một seam kiểu JavaScript là tham số hàm mặc định (`now = () => new Date()`) hoặc `vi.mock` (dùng khi không sửa được code, vì nó ẩn). Hexagonal chính là cách tổ chức mà mọi thứ đều có seam (port). Khi di chuyển legacy sang Hexagonal, từng bước: characterization test → tách port quanh I/O → thay thế dần.

## 5. Snapshot và approval test

Khi output lớn hoặc có cấu trúc (JSON, HTML, báo cáo), liệt kê assertion thủ công rất tốn công. **Approval/snapshot test** lưu output "đã được duyệt" ra file, và test so sánh output mới với file đó.

Vitest có sẵn `toMatchFileSnapshot` (so với một file bạn đặt tên và đường dẫn) và `toMatchSnapshot` (lưu trong thư mục `__snapshots__`). Lab dùng file snapshot để file `approved` đọc được như một JSON bình thường (`lab/tests/characterization/shipping-fee.characterization.test.ts`):

```ts
it('matches the approved snapshot', async () => {
  const order = OrderBuilder.anOrder().withId('snap-1').withLine('SKU-2', 2, 30_000).placed().build();

  const actual = JSON.stringify(presentOrder(order), null, 2) + '\n';

  await expect(actual).toMatchFileSnapshot('./approved/order-response.approved.json');
});
```

File `tests/characterization/approved/order-response.approved.json` được commit cùng code. Khi output thay đổi có chủ ý, người dev xem diff, duyệt, và cập nhật file (`vitest run -u`). Hành vi quan trọng: trong môi trường CI (biến `CI=true`, lab đặt trong `run.sh`) Vitest **không** tự ghi snapshot mới và cũng không tự cập nhật; snapshot thiếu hoặc lệch thì test đỏ. Ở máy local, snapshot chưa tồn tại sẽ được ghi tự động ở lần chạy đầu, nên hãy review file mới sinh ra như review code. Thư viện không cần thêm, vì runner đã có sẵn.

| | Snapshot/approval | Assert thủ công |
|---|---|---|
| Output lớn | tốt | tốn công |
| Ý định test | mờ ("nó giống bản cũ") | rõ |
| Rủi ro | duyệt bừa, cập nhật snapshot mà không đọc | ít |

## 6. Trade-off

- Characterization test pin cả bug hiện tại: đó là chủ đích, nhưng đừng để nó thành tài liệu "hành vi đúng". Ghi chú rõ test nào là "quan sát" chứ không phải "yêu cầu".
- Snapshot dễ bị cập nhật theo phản xạ (`-u`). Quy tắc: diff snapshot phải được review như code.
- Đừng snapshot dữ liệu không ổn định (timestamp, id random, thứ tự non-deterministic) vì thành flaky; chuẩn hóa hoặc loại ra trước khi so. Vitest có `expect.any(String)` cho inline snapshot và `toMatchInlineSnapshot` với property matcher cho việc này.
- Không dùng snapshot cho logic nghiệp vụ mà bạn hiểu rõ; viết assertion cụ thể, có ý nghĩa.

## 7. Cạm bẫy

- Viết test bằng cách sao chép logic của code legacy vào test.
- Snapshot quá lớn (cả trang HTML) → mọi thay đổi nhỏ làm đỏ và người ta duyệt không đọc.
- Quên rằng characterization test là cầu nối tạm; khi đã hiểu nghiệp vụ, thay bằng unit/acceptance test có ý nghĩa.
- Sửa code và test cùng lúc (mất chức năng bảo vệ). Làm theo thứ tự: pin hành vi, rồi mới refactor.
- Chạy `vitest -u` trước khi đọc diff.

## 8. Tóm tắt

- Legacy = code không có test; bước đầu là pin hành vi hiện tại bằng characterization test.
- Quy trình: chạy code, quan sát, ghi lại; không đoán. Lab đã đoán sai ca `1000g, HCM` (15.000 so với 20.000) ở cả bản gốc lẫn bản TypeScript.
- Tìm seam để chèn test; Hexagonal chính là kiến trúc đầy seam.
- Snapshot/approval tiện cho output lớn (`toMatchFileSnapshot`), nhưng phải review diff và loại dữ liệu không ổn định.

## 9. Câu hỏi tự kiểm tra

1. Vì sao ta lấy giá trị expected từ việc chạy code thay vì từ đặc tả?
2. Trong lab, ca `1000g, HCM` bị đoán sai thành bao nhiêu và đúng là bao nhiêu?
3. Seam là gì? Cho một ví dụ.
4. Rủi ro lớn nhất của snapshot test là gì?
5. Vì sao `CI=true` quan trọng với snapshot test?

<details><summary>Đáp án</summary>

1. Vì không có đặc tả tin cậy; mục tiêu là phát hiện thay đổi hành vi khi refactor, kể cả hành vi hiện tại là bug.
2. Đoán 15.000; thực tế 20.000 (15.000 + 10.000 phí trọng lượng - 5.000 giảm nội thành).
3. Điểm có thể thay đổi hành vi mà không sửa code tại chỗ, ví dụ bọc lời gọi `new Date()` vào interface `Clock` nhận qua constructor (port).
4. Cập nhật snapshot theo phản xạ mà không đọc diff, nên bug lọt vào "bản đã duyệt".
5. Ở CI Vitest không ghi snapshot mới; snapshot thiếu hoặc lệch làm test đỏ thay vì âm thầm được tạo ra và xanh giả.
</details>
