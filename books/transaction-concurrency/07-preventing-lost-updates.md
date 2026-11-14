# Chương 7. Năm cách chống lost update

## 1. Tình huống

Hai request cùng cộng tiền vào ví 1 (số dư 100): +10 và +20. Cả hai đọc `bal=100` ở application layer, tính, rồi ghi. Số dư cuối là 110 (hoặc 120), đúng ra 130. Chương 3 cho thấy lỗi này xảy ra ở mặc định của PostgreSQL (`READ COMMITTED`) và MySQL (`REPEATABLE READ`): kịch bản `lost_update` đã chạy, số dư cuối PG ở RC là **110**.

Bảng dùng: `acct(id, bal, ver)`. Mọi kết quả dưới đây lấy từ `lab/scenarios/*/lost_update_*.sql` ở bản đã chạy.

## 2. Cách 1: atomic UPDATE

Đẩy phép tính vào chính câu `UPDATE`, để DB tự read-modify-write dưới row lock:

```sql
UPDATE acct SET bal = bal + 20 WHERE id = 1;
```

Câu lệnh này lấy lock dòng, tính trên **giá trị mới nhất đã commit** rồi ghi. B chờ A commit rồi mới cộng.

| Level | PostgreSQL | MySQL |
|---|---|---|
| READ COMMITTED | đúng (130) | đúng |
| REPEATABLE READ | B nhận `40001` (dòng đã bị sửa sau snapshot của B), cần retry | đúng |
| SERIALIZABLE | `40001`, cần retry | đúng |

Trong Go: `tx.Exec(ctx, "UPDATE acct SET bal = bal + $1 WHERE id = $2", 20, 1)` là đúng loại câu này (`transfer.go` dùng nó). Nên dùng cách này trước tiên cho bộ đếm, số dư, tồn kho. Giới hạn: chỉ dùng được khi phép tính biểu diễn được trong SQL. Muốn kiểm tra "không âm" thì thêm `WHERE bal >= 20` và kiểm số dòng bị ảnh hưởng:

```sql
UPDATE acct SET bal = bal - 20 WHERE id = 1 AND bal >= 20;   -- 0 dòng nghĩa là không đủ tiền
```

## 3. Cách 2: SELECT ... FOR UPDATE (pessimistic locking)

Khi logic quá phức tạp để nhét vào một câu `UPDATE` (ví dụ gọi code tính phí), lock dòng ngay khi đọc:

```sql
BEGIN;
SELECT bal FROM acct WHERE id = 1 FOR UPDATE;   -- người khác chờ ở đây
-- tính ở ứng dụng
UPDATE acct SET bal = <giá trị mới> WHERE id = 1;
COMMIT;
```

Kết quả đã chạy (`lost_update_forupdate`): PG `READ COMMITTED` đúng (B chờ, sau đó đọc giá trị mới 110 và ghi 130). PG `REPEATABLE READ`/`SERIALIZABLE`: B nhận `40001` vì snapshot của B cũ hơn dòng đã sửa. MySQL đúng ở cả ba level vì locking read luôn đọc bản mới nhất.

Điểm cần nhớ: lock chỉ giữ đến hết transaction, nên **chỉ giữ lock lúc cần** và giữ transaction ngắn (đừng gọi API ngoài khi đang giữ lock).

## 4. Cách 3: optimistic locking bằng cột version

Không lock lúc đọc. Khi ghi, kiểm tra không ai sửa trong lúc mình tính:

```sql
-- đọc
SELECT bal, ver FROM acct WHERE id = 1;          -- bal=100, ver=0
-- ghi
UPDATE acct SET bal = 110, ver = ver + 1
 WHERE id = 1 AND ver = 0;                        -- kiểm 0 hay 1 dòng bị ảnh hưởng
```

Nếu 0 dòng bị ảnh hưởng nghĩa là có người đã sửa: đọc lại và thử lại (hoặc báo người dùng "dữ liệu đã đổi, tải lại"). Đây là **compare-and-set (CAS)** ở row-level.

Kết quả đã chạy (`lost_update_cas`, ở `READ COMMITTED`): A đọc `ver=0` rồi chờ; B đọc, ghi trước (`ver` thành 1, `bal=120`). A thử CAS lần 1: **0 dòng**; A đọc lại (`bal=120, ver=1`), CAS lần 2: **1 dòng**. Kết quả cuối `bal=130, ver=2`. Cách này đúng ở cả ba level trên cả hai DB mà không có lỗi nào, vì xung đột nằm gọn trong điều kiện `WHERE`.

Code Go khớp tên: `lab/go/optimistic.go` (`RowsAffected() == 1`, backoff có jitter). Đã chạy: hai goroutine nạp +10 và +20, một bên phải đọc lại (`tries=2`), kết quả 130, `ver = 2` (`lab/out/go.txt`, mục 3).

Ưu điểm: không giữ lock khi người dùng "suy nghĩ" (form sửa mở nhiều phút, API trả version cho client dạng ETag/`If-Match`). Nhược điểm: khi xung đột nhiều, tốn retry; phải thêm cột và nhớ kiểm ở **mọi** chỗ ghi.

CAS trên giá trị thay vì version: `UPDATE ... SET bal = 110 WHERE id = 1 AND bal = 100`. Đơn giản hơn nhưng dính vấn đề ABA (giá trị đổi rồi quay lại cũ thì CAS vẫn qua). Cột version đơn điệu tăng không bị.

## 5. Cách 4: SERIALIZABLE + retry

Đặt `SERIALIZABLE` và để DB phát hiện. Kết quả đã chạy cho `lost_update` ở SERIALIZABLE: PG trả `40001`, MySQL trả deadlock `1213`. Cả hai hủy một transaction, kết quả cuối không mất dữ liệu, nhưng **bạn phải bắt lỗi và chạy lại cả transaction** (xem `lab/go/retry.go`, chương 10; đã chạy với pgx ở mục 4 của `lab/out/go.txt` và với MySQL ở mục 8). Ưu điểm: một cơ chế chung bảo vệ cả write skew (chương 8), không cần nhớ từng chỗ. Nhược điểm: tỷ lệ abort cao khi contention; transaction phải **idempotent trong phần DB** (chạy lại không có side effect ngoài DB).

## 6. Cách 5: advisory lock

`pg_advisory_xact_lock(key)` (PG) hoặc `GET_LOCK()` (MySQL) lock theo một con số/chuỗi bạn tự chọn, không cần có dòng nào. Dùng khi đối tượng cần bảo vệ chưa tồn tại như dòng. Xem chương 5.

## 7. So sánh và khi nào dùng

| Cách | Chờ hay lỗi | Giữ lock lâu? | Khi nào dùng |
|---|---|---|---|
| Atomic `UPDATE` | chờ ngắn | không | Bộ đếm, số dư, tồn kho. **Mặc định nên thử đầu tiên** |
| `FOR UPDATE` | chờ | có (đến hết transaction) | Logic phức tạp, cần nhìn nhiều dòng trước khi ghi, contention cao |
| Optimistic (version) | không chờ, retry khi 0 dòng | không | Form sửa dài, API có ETag, contention thấp |
| SERIALIZABLE + retry | lỗi 40001/1213, retry | tùy DB | Logic liên dòng phức tạp, chấp nhận retry |
| Advisory lock | chờ | theo transaction/session | Bảo vệ thứ không phải một dòng |

Cây quyết định ngắn: (1) viết được thành một `UPDATE` atomic không? Dùng nó. (2) Người dùng mở form lâu? Optimistic. (3) Contention cao và phải đọc nhiều trước khi ghi? `FOR UPDATE`. (4) Invariant liên dòng khó lock? SERIALIZABLE + retry.

## 8. Cạm bẫy

1. `SELECT` rồi `UPDATE ... SET bal = :giá_trị_đọc_được + 20` ở level mặc định: chính là lost update.
2. `FOR UPDATE` ở PG `REPEATABLE READ` mà không có retry, vì sẽ nhận `40001` thay vì chờ-và-đọc-mới.
3. Optimistic locking mà quên kiểm số dòng bị ảnh hưởng: ghi "thành công" mà thực ra 0 dòng.
4. Cột `ver` chỉ được cập nhật ở một số nơi: ai quên là phá cơ chế.
5. Retry vòng lặp không giới hạn và không backoff, gây bão retry.
6. ORM `save()` ghi toàn bộ cột từ bản trong bộ nhớ: một lost update ngầm. Cân nhắc chỉ cập nhật cột thay đổi và dùng version.

## 9. Tóm tắt

- Lost update xảy ra khi read-modify-write ở ứng dụng ở level mặc định; PG RC cho kết quả 110 trong kịch bản đã chạy.
- Atomic `UPDATE` là cách rẻ và an toàn nhất; thử trước tiên.
- `FOR UPDATE` serialize các transaction bằng lock; optimistic dùng `WHERE ver = ?` và kiểm số dòng.
- SERIALIZABLE chặn bằng cách hủy transaction, buộc phải retry.
- PG RR/SERIALIZABLE biến lost update thành lỗi `40001`; MySQL RR không phát hiện nên cần cách khác.

## 10. Tự kiểm tra

1. Vì sao `UPDATE acct SET bal = bal + 20` an toàn hơn đọc rồi ghi?
2. Optimistic locking báo xung đột bằng cách nào?
3. Vì sao `FOR UPDATE` ở PG `REPEATABLE READ` có thể ném `40001` còn ở MySQL thì không?
4. Khi nào chọn SERIALIZABLE + retry thay vì `FOR UPDATE`?

<details><summary>Đáp án</summary>

1. Phép tính và ghi diễn ra trong một câu lệnh dưới row lock, trên giá trị mới nhất.
2. Câu `UPDATE ... WHERE ver = ?` ảnh hưởng 0 dòng.
3. PG dùng snapshot cũ của transaction; dòng đã bị sửa sau snapshot nên báo lỗi serialization. InnoDB locking read đọc bản mới nhất.
4. Khi invariant liên quan nhiều dòng hoặc query theo điều kiện (khó biết dòng nào cần lock) và chấp nhận retry.
</details>
