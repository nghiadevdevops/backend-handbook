# Chapter 8. Write Skew and Phantoms: On-Call Schedules and Room Booking

## 1. Scenario

Hai bài toán, cùng một dạng:

- **Lịch trực.** Luật: luôn có ít nhất một bác sĩ trực. Alice và Bob đều đang trực và cùng lúc bấm "xin nghỉ". Mỗi người kiểm tra "còn người khác trực không?", thấy còn, rồi tự rút tên mình. Cuối cùng không còn ai trực.
- **Đặt phòng.** Hai người cùng đặt phòng 1 vào các giờ chồng nhau. Mỗi bên kiểm tra "không có lịch nào chồng", thấy trống, rồi chèn lịch của mình. Cuối cùng hai lịch chồng nhau.

Đây là **write skew**: đọc cùng một tập dữ liệu, quyết định dựa trên nó, ghi vào **những dòng khác nhau**. Khác lost update (chương 7), không có dòng nào bị ghi bởi cả hai, nên không có write-write conflict để DB nhận ra. Bài toán đặt phòng còn là **phantom**: thứ cần lock là dòng *chưa tồn tại*.

Kết quả đã chạy (chương 3): write skew xảy ra ở PostgreSQL `READ COMMITTED` và `REPEATABLE READ`, và ở MySQL `READ UNCOMMITTED`, `READ COMMITTED`, `REPEATABLE READ`; chỉ `SERIALIZABLE` chặn (PG: `40001` SSI, MySQL: deadlock `1213`). Chương này đi qua bốn lời giải.

## 2. Solution 1: SERIALIZABLE (+ retry)

Đặt `SERIALIZABLE` cho cả hai transaction và để DB chặn. Đã chạy (`write_skew`, `booking`):

| | Lịch trực | Đặt phòng |
|---|---|---|
| PostgreSQL SERIALIZABLE | một bên `40001 ... read/write dependencies among transactions` | cùng |
| MySQL SERIALIZABLE | một bên deadlock `1213` | cùng |

Cả hai trường hợp: transaction thua phải **được retry toàn bộ**. Lần chạy lại sẽ thấy kết quả của bên thắng ("còn đúng 1 bác sĩ", "phòng đã có lịch") và tự dừng. Nhớ: PG báo lỗi khi phát hiện *khả năng* serialize được (có thể là false positive); InnoDB chặn bằng lock và deadlock. Trường hợp InnoDB, mọi `SELECT` thường trong transaction đều thành locking read, nên concurrency giảm mạnh.

Ưu điểm: không cần suy nghĩ lock nào, bảo vệ cả những invariant bạn chưa nghĩ tới. Nhược điểm: bắt buộc có retry; tỷ lệ abort; trên InnoDB tốn concurrency.

## 3. Solution 2: lock the rows you just read (`FOR UPDATE`)

Với lịch trực, tập dữ liệu đã đọc chính là các dòng `on_call = true`. Lock chúng ngay khi đọc:

```sql
BEGIN;
SELECT count(*) FROM (SELECT 1 FROM doctors WHERE on_call FOR UPDATE) s;   -- PG
-- MySQL: SELECT COUNT(*) FROM doctors WHERE on_call = 1 FOR UPDATE;
UPDATE doctors SET on_call = false WHERE id = :minh AND :count >= 2;
COMMIT;
```

Bên thứ hai chờ ở câu `SELECT ... FOR UPDATE`; khi bên thứ nhất commit, nó đọc lại và thấy chỉ còn 1 người.

Kết quả đã chạy (`ws_forupdate`):

| Level | PostgreSQL | MySQL |
|---|---|---|
| READ COMMITTED | đúng (còn 1 bác sĩ) | đúng |
| REPEATABLE READ | `40001` (concurrent update), retry | đúng |
| SERIALIZABLE | `40001`, retry | đúng |

PG ở `READ COMMITTED` làm đúng vì sau khi chờ xong, PG kiểm tra lại điều kiện `on_call` trên phiên bản mới của dòng (EvalPlanQual) và thấy dòng của bên kia không còn thỏa. Hạn chế: **chỉ lock được những dòng đang tồn tại**. Với đặt phòng, "không có lịch chồng" nghĩa là không có dòng nào để lock (đó là phantom), `FOR UPDATE` không ngăn được chèn.

## 4. Solution 3: materializing the conflict

Ý tưởng: biến xung đột thành một dòng. Khi không có dòng để lock, **tạo ra** một dòng đại diện và lock nó. Lịch trực: bảng `shifts(id)` có dòng cho ca đang xét; mọi transaction thay đổi lịch của ca đó phải `SELECT ... FROM shifts WHERE id = :ca FOR UPDATE` trước. Đặt phòng: lock dòng của phòng trong bảng `rooms`, hoặc tạo trước các ô giờ (bảng `slot(room, hour)`).

Kết quả đã chạy (`ws_materialize`, lock dòng `shifts` rồi mới đếm):

| Level | PostgreSQL | MySQL |
|---|---|---|
| READ COMMITTED | đúng | đúng |
| REPEATABLE READ | **vẫn sai** (0 bác sĩ) | đúng |
| SERIALIZABLE | `40001` | đúng |

PG `REPEATABLE READ` vẫn sai vì snapshot của transaction được lấy ngay ở câu đầu tiên, chính là câu `FOR UPDATE` đang phải chờ; khi chờ xong, các câu sau vẫn dùng snapshot cũ nên đếm ra 2. Bài học: trên PG, mẫu "lock một dòng chung" đúng ở `READ COMMITTED` (mỗi câu có snapshot mới) nhưng **không** đủ ở `REPEATABLE READ`. InnoDB `REPEATABLE READ` đúng vì read view chỉ được lập ở lần đọc *non-locking* đầu tiên (đã kiểm tra bằng kết quả trên).

Phiên bản "ô giờ" cho đặt phòng (kịch bản `booking_slots` của MySQL): bảng `slot(room, hr, PRIMARY KEY(room, hr))`, mỗi lịch chèn một dòng cho từng giờ. Hai lịch chồng nhau đụng cùng primary key. Đã chạy ở `REPEATABLE READ` trên MySQL: một bên bị `ERROR 1062 Duplicate entry '1-10' for key 'slot.PRIMARY'`; cuối cùng chỉ có 2 ô (một lịch hợp lệ). Ràng buộc do DB thực thi, không cần level cao.

## 5. Solution 4: constraints (PostgreSQL exclusion constraints)

Cách tốt nhất khi có thể: để **DB thực thi quy tắc**, không phải code. PostgreSQL có **exclusion constraint** cho bài toán chồng khoảng:

```sql
CREATE EXTENSION btree_gist;
CREATE TABLE booking (
  id serial PRIMARY KEY, room int, s int, e int,
  EXCLUDE USING gist (room WITH =, int4range(s, e) WITH &&)
);
```

`&&` là operator "chồng nhau" của range. Mọi lần `INSERT`/`UPDATE` làm hai dòng cùng `room` có khoảng giờ chồng nhau sẽ lỗi `23P01 conflicting key value violates exclusion constraint`, ở **mọi isolation level**, kể cả khi hai transaction đồng thời (insert thứ hai chờ insert thứ nhất commit rồi mới lỗi). Kết quả đã chạy ở `READ COMMITTED` (`booking_exclusion`): một lịch được lưu, một bên nhận lỗi `23P01`; không cần `SERIALIZABLE`, không cần `FOR UPDATE`.

MySQL không có exclusion constraint. Thay thế: ô giờ với primary key/UNIQUE (ở trên), hoặc lock dòng phòng (materialize), hoặc `SERIALIZABLE` + retry.

Với bài lịch trực, "luôn có ≥ 1 người" khó biểu diễn bằng constraint chuẩn; thường dùng lock dòng hoặc SERIALIZABLE.

## 6. Comparison

| Cách | Chặn bằng | Chi phí | Dùng khi |
|---|---|---|---|
| SERIALIZABLE + retry | lỗi, retry | tỷ lệ abort; InnoDB giảm concurrency | invariant phức tạp, nhiều chỗ, chấp nhận retry |
| `FOR UPDATE` các dòng đã đọc | chờ | giữ lock | tập dòng đã tồn tại, rõ ràng |
| Materialize (lock dòng đại diện) | chờ | thêm bảng/dòng; chú ý snapshot PG RR | phantom, không có dòng để lock |
| Constraint (UNIQUE, exclusion) | lỗi tại DB | gần như không | khi quy tắc biểu diễn được. **Ưu tiên số 1** |

## 7. Pitfalls

1. Kiểm tra bằng `SELECT` rồi `INSERT` ở level mặc định và tin rằng đã an toàn (đã chạy: sai ở cả hai DB).
2. `FOR UPDATE` trên query "không có dòng nào": không lock được gì (PG), hoặc chỉ lock khoảng nhờ gap lock ở InnoDB, đổi lại gây deadlock (chương 5, 6).
3. Trên PG `REPEATABLE READ`, lock dòng chung rồi đọc: snapshot đã cũ.
4. Bật `SERIALIZABLE` không kèm retry.
5. Quên rằng exclusion constraint cần extension `btree_gist` khi kết hợp `=` trên kiểu thường với `&&` trên range.

## 8. Summary

- Write skew: đọc chung, ghi riêng, invariant liên dòng vỡ; phantom là biến thể "dòng chưa tồn tại".
- Đã chạy: chỉ SERIALIZABLE chặn tự động; cả hai DB chặn bằng lỗi nên cần retry.
- `FOR UPDATE` tập đã đọc đúng ở PG RC và MySQL; materialize cần để ý snapshot PG RR.
- Constraint (UNIQUE, `EXCLUDE USING gist`) là lời giải gọn nhất khi biểu diễn được.

## 9. Self-check

1. Vì sao `FOR UPDATE` không cứu được bài đặt phòng?
2. Materialize conflict là gì? Cho một ví dụ.
3. Vì sao materialize bằng lock dòng chung vẫn sai trên PG `REPEATABLE READ`?
4. Exclusion constraint chặn ở level nào?

<details><summary>Answer</summary>

1. "Không có lịch chồng" nghĩa là tập rỗng; không có dòng để lock nên chèn đồng thời vẫn lọt.
2. Tạo dòng đại diện để lock, ví dụ lock dòng `shifts` hoặc `rooms`, hoặc bảng ô giờ có primary key.
3. Snapshot được lấy ở câu đầu tiên (chính câu `FOR UPDATE` phải chờ), nên các câu sau dùng dữ liệu cũ.
4. Mọi level, vì kiểm tra nằm ở index lúc insert.
</details>
