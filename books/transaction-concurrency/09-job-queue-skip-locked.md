# Chương 9. Job queue bằng `FOR UPDATE SKIP LOCKED` và `NOWAIT`

## 1. Tình huống

Bạn có bảng `jobs` và nhiều worker cùng lấy việc. Cách ngây thơ: `SELECT ... WHERE state='new' LIMIT 1`, rồi `UPDATE ... SET state='running'`. Hai worker cùng `SELECT` thấy cùng job (anomaly kiểu lost update ở chương 7): job chạy hai lần. Thêm `FOR UPDATE` thì an toàn nhưng worker thứ hai **đứng chờ** worker thứ nhất, mất hết tính song song. Cần: "lấy job nào đang không ai giữ".

## 2. Cơ chế

Thêm hai tùy chọn sau `FOR UPDATE` (cả PostgreSQL và MySQL 8.0 trở lên đều hỗ trợ):

| Tùy chọn | Gặp dòng đang bị lock thì | Dùng khi |
|---|---|---|
| (không) | chờ | cần chắc chắn đúng dòng đó |
| `NOWAIT` | **lỗi ngay** | "thử lock, không được thì báo lỗi" |
| `SKIP LOCKED` | **bỏ qua dòng đó**, lấy dòng khác | queue, worker pool |

Chưa nói tới chuyện nhận đúng thứ tự: `SKIP LOCKED` trả về tập dòng "không đẹp" (không nhất quán với view đầy đủ), nên chỉ phù hợp queue, không phù hợp báo cáo.

### Kịch bản `skip_locked` (đã chạy)

Sáu job `new`. Worker A nhận 2 job và giữ transaction 4 giây. Worker B bắt đầu sau 2 giây, cũng xin 2 job.

```sql
BEGIN;
WITH c AS (
  SELECT id FROM jobs WHERE state = 'new' ORDER BY id LIMIT 2
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs j SET state = 'running', worker = 'A'
FROM c WHERE j.id = c.id
RETURNING j.id;
-- ... xử lý ...
COMMIT;
```

Kết quả trên PostgreSQL 18.6:

```
A nhận job | 1, 2
B nhận job | 3, 4        (không chờ A, không trùng)
trạng thái cuối: 1,2 = running/A; 3,4 = running/B; 5,6 = new
```

MySQL 9.7.4 cho cùng kết quả với câu `SELECT id FROM jobs WHERE state='new' ORDER BY id LIMIT 2 FOR UPDATE SKIP LOCKED`: A nhận 1, 2; B nhận 3, 4.

### Kịch bản `nowait` (đã chạy)

A giữ `FOR UPDATE` trên job 1. B chạy `SELECT ... WHERE id=1 FOR UPDATE NOWAIT`:

- PostgreSQL: `ERROR: could not obtain lock on row in relation "jobs"` (SQLSTATE `55P03`).
- MySQL: `ERROR 3572 (HY000): Statement aborted because lock(s) could not be acquired immediately and NOWAIT is set.`

`NOWAIT` hợp với tình huống "tôi muốn độc quyền xử lý bản ghi này, nếu người khác đang giữ thì bỏ qua/báo người dùng", ví dụ nút "chốt đơn" bấm hai lần.

## 3. Thiết kế queue đầy đủ

Điểm nguy hiểm của mẫu trên: nếu bạn giữ transaction mở suốt thời gian **xử lý job**, bạn có transaction dài (chương 4: bloat, giữ snapshot) và nếu worker chết thì lock tự nhả nhưng job không có dấu vết. Mẫu thường dùng hơn là **claim ngắn, xử lý ngoài transaction**:

```sql
-- 1) Claim (transaction ngắn, commit ngay)
UPDATE jobs j SET state='running', worker=:w, locked_until = now() + interval '5 minutes'
FROM (SELECT id FROM jobs WHERE state='new' ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) c
WHERE j.id = c.id RETURNING j.*;
-- 2) Xử lý ở app (không giữ lock)
-- 3) Hoàn tất
UPDATE jobs SET state='done' WHERE id=:id AND worker=:w;
-- 4) Một job định kỳ trả lại các job quá hạn (worker chết)
UPDATE jobs SET state='new', worker=NULL WHERE state='running' AND locked_until < now();
```

(Cột `locked_until` không có trong bảng mẫu ở các chương trước; thêm nếu dùng mẫu này.) Gợi ý index PG: `CREATE INDEX ON jobs (id) WHERE state = 'new';` (partial index nhỏ, theo chương về index).

Code Go khớp tên: `lab/go/claimer.go` (`FOR UPDATE SKIP LOCKED` trong `pgx.BeginTxFunc`). Đã chạy: 3 worker nhận đồng thời 6 job, mỗi worker được 2 job khác nhau, không ai chờ ai (`lab/out/go.txt`, mục 7).

## 4. Trade-off

| | Queue trong DB (SKIP LOCKED) | Message broker (RabbitMQ, Kafka, SQS...) |
|---|---|---|
| Consistency với dữ liệu nghiệp vụ | Tốt: chung transaction với ghi dữ liệu | Cần outbox (chương 11) |
| Throughput | Vài nghìn job/giây là ổn; cao hơn thì bảng nóng | Rất cao |
| Vận hành | Không thêm hệ thống | Thêm hệ thống |
| Tính năng (routing, DLQ, replay) | Tự làm | Có sẵn |

Quy mô nhỏ đến vừa, đã có DB: queue trong DB rất hợp lý. Cần fan-out nhiều consumer, replay, throughput lớn: broker.

## 5. Cạm bẫy

1. Giữ transaction mở suốt lúc xử lý job (transaction dài, ảnh hưởng vacuum/purge).
2. Quên rằng thứ tự không đảm bảo FIFO tuyệt đối khi có worker bỏ qua dòng bị lock.
3. Không có cơ chế thu hồi job của worker đã chết.
4. Không có index phù hợp: mỗi lần claim quét cả bảng và xếp hàng lock dòng không cần thiết.
5. Dùng `SKIP LOCKED` để lấy dữ liệu báo cáo: kết quả thiếu dòng một cách im lặng.
6. Job "độc" (luôn lỗi) quay vòng mãi: cần đếm số lần thử và trạng thái `failed`.

## 6. Tóm tắt

- `FOR UPDATE SKIP LOCKED` bỏ qua dòng đang bị lock, cho phép nhiều worker lấy job không trùng và không chờ.
- `NOWAIT` báo lỗi ngay (PG `55P03`, MySQL `3572`) thay vì chờ.
- Đã chạy: A nhận job 1, 2; B nhận 3, 4 trên cả hai DB.
- Claim ngắn, xử lý ngoài transaction, có lease và job thu hồi.
- Quy mô lớn thì cân nhắc broker.

## 7. Tự kiểm tra

1. Khác biệt giữa `NOWAIT` và `SKIP LOCKED`?
2. Vì sao không nên giữ transaction suốt lúc xử lý job?
3. `SKIP LOCKED` có thích hợp để đếm số job còn lại không? Vì sao?
4. Mã lỗi `NOWAIT` của PG và MySQL?

<details><summary>Đáp án</summary>

1. `NOWAIT` ném lỗi khi gặp dòng bị lock; `SKIP LOCKED` lặng lẽ bỏ qua dòng đó.
2. Giữ snapshot/lock lâu, gây bloat hoặc history list dài và chờ lock.
3. Không: kết quả bỏ sót các dòng đang bị lock nên đếm sai.
4. PG `55P03`; MySQL lỗi `3572`.
</details>
