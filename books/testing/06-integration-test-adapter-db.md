# Chapter 6. Integration tests for adapters with a real PostgreSQL

## 1. Scenario

`PostgresOrderRepository` chạy trên máy dev nhưng lỗi trên production: cột `placed_at` là `timestamptz` và timezone bị lệch; `ON CONFLICT` quên cập nhật dòng; lưu lại đơn nhân đôi dòng hàng; cột `bigint` trả về dưới dạng string nên `price + 1` thành `"30000000001"`. Không unit test nào bắt được vì lỗi nằm ở **sự tương tác với database thật**. Adapter là "keo" với infrastructure nên cách duy nhất kiểm tra nó là chạy với infrastructure thật.

## 2. Principles

- Dùng **DB thật cùng loại và phiên bản gần production** (không dùng SQLite thay PostgreSQL: khác data type, constraint, hành vi `ON CONFLICT`, timezone).
- Mỗi test **bắt đầu từ clean state** và không để lại dấu vết.
- Kiểm tra qua public port: `save()` rồi `get()` ("round trip"), cộng vài ca đọc/ghi thẳng vào DB cho constraint.

## 3. Running PostgreSQL in Docker

Lab dùng script `run.sh up`, thực chất làm:

```bash
docker network create bookcheck-testts-net
docker run -d --name bookcheck-testts-pg --network bookcheck-testts-net --memory 256m \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app \
  postgres:18-alpine
until docker exec bookcheck-testts-pg pg_isready -U app -d app; do sleep 1; done
```

Container test (image `node:26`) và DB nói chuyện qua network riêng, không map port ra host. Test nhận connection string qua environment variable `DATABASE_URL=postgres://app:app@bookcheck-testts-pg:5432/app`. File test **không có giá trị mặc định** cho biến này và ném lỗi rõ ràng nếu thiếu, để không vô tình chạy vào một DB nào đó trên máy.

**Testcontainers for Node** (`testcontainers` và `@testcontainers/postgresql`, bản 12.2.1 ở 11/2026) khởi động container ngay từ code test và tự dọn dẹp, nên test tự đủ (self-contained):

```ts
// Minh họa theo docs của Testcontainers, CHƯA chạy trong lab này
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const container = await new PostgreSqlContainer('postgres:18-alpine').start();
const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
// ... chạy test ...
await container.stop();
```

Lab này **không dùng Testcontainers**, và đó là một trade-off có chủ đích. Khi test chạy *bên trong* một container (như lab, để không cài Node lên máy), Testcontainers cần Docker socket của host được mount vào container test (`-v /var/run/docker.sock:/var/run/docker.sock`), tức là code test có quyền điều khiển mọi container trên máy; nó còn publish port ngẫu nhiên ra host và khởi động thêm container "Ryuk" để dọn dẹp. Cả ba điều này đi ngược quy ước của lab (không đụng container khác, không map port ra host, mọi tài nguyên có tiền tố `bookcheck-testts-`). Vì vậy lab dùng một container PostgreSQL được dựng sẵn bằng script, và trả giá bằng một bước chuẩn bị (`./run.sh up`) nằm ngoài code test.

| | Container dựng sẵn (lab) | Testcontainers |
|---|---|---|
| Tự đủ | không: cần `./run.sh up` trước | có: `npm test` là đủ |
| Quyền cần có | chỉ network riêng | Docker socket (khi test chạy trong container) |
| Dọn dẹp | script `down` | Ryuk tự dọn, kể cả khi test bị kill |
| DB cho mỗi suite | dùng chung một DB, cô lập bằng transaction | dễ có DB riêng cho mỗi file test |
| Hợp với | CI có `services:` (chương 12), dev dùng compose | dev chạy test trực tiếp trên máy có Node, thư viện nhiều suite |

Nếu Node chạy trực tiếp trên máy dev hoặc runner CI (không lồng trong container), Testcontainers thường là lựa chọn tiện hơn.

## 4. Managing test data: transaction rollback

Cách nhanh nhất để giữ DB sạch: mỗi test chạy trong một transaction và **rollback** ở cuối. Với driver `pg`, transaction gắn với **một connection**, nên test phải lấy một `PoolClient` riêng (không thể `pool.query('BEGIN')` vì mỗi lần `pool.query` có thể rơi vào connection khác):

```ts
beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  repo = new PostgresOrderRepository(client);
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});
```

Để cách này hoạt động, adapter phải **tôn trọng transaction bên ngoài**. Constructor của `PostgresOrderRepository` nhận `Pool | PoolClient`; `save` mở transaction riêng chỉ khi được đưa một `Pool`:

```ts
const own = this.#db instanceof pg.Pool;
const client = this.#db instanceof pg.Pool ? await this.#db.connect() : this.#db;
try {
  if (own) {
    await client.query('BEGIN');
  }
  // ... INSERT ... ON CONFLICT, DELETE lines, INSERT lines ...
  if (own) {
    await client.query('COMMIT');
  }
} catch (error) {
  if (own) {
    await client.query('ROLLBACK');
  }
  throw error;
} finally {
  if (own && 'release' in client) {
    client.release();
  }
}
```

Nguồn: `lab/src/infrastructure/postgres-order-repository.ts`. Schema được tạo một lần ở `beforeAll` bằng `db/schema.sql` (`CREATE TABLE IF NOT EXISTS`).

So sánh các chiến lược dọn dữ liệu:

| Cách | Tốc độ | Ưu | Nhược |
|---|---|---|---|
| Transaction + rollback | nhanh nhất | không dấu vết | không test được code tự commit/nested transaction; DDL ở Postgres vẫn rollback được nhưng một số lệnh thì không |
| `TRUNCATE` trước mỗi test | vừa | test cả commit thật | chậm hơn, cần quản lý thứ tự FK |
| DB mới (container/schema) mỗi test file | chậm | isolation tuyệt đối | tốn thời gian |
| Dữ liệu id duy nhất, không dọn | nhanh | chạy parallel được | DB phình, dễ leak dữ liệu giữa test |

Quyết định của lab: rollback cho phần lớn; riêng nhánh "adapter tự commit" có một test dùng `Pool` thật, id có tiền tố `own-` và được `DELETE` ở `afterAll`.

## 5. The adapter's tests

Từ `lab/tests/integration/postgres-order-repository.test.ts`:

```ts
it('round trips an order with lines', async () => {
  const order = OrderBuilder.anOrder().withId('it-1').withLine('SKU-2', 3, 25_000).placed().build();

  await repo.save(order);
  const loaded = await repo.get('it-1');

  expect(loaded.id).toBe('it-1');
  expect(loaded.status).toBe('placed');
  expect(loaded.placedAt).toEqual(order.placedAt);
  expect(loaded.lines).toHaveLength(2);
  expect(loaded.lines[1]?.sku).toBe('SKU-2');
  expect(loaded.total().equals(Money.vnd(175_000))).toBe(true);
});

it('saving again updates status and replaces lines', async () => {
  const order = OrderBuilder.anOrder().withId('it-2').withLine('SKU-2', 1, 10_000).placed().build();
  await repo.save(order);

  order.markPaid();
  await repo.save(order);

  const loaded = await repo.get('it-2');
  expect(loaded.status).toBe('paid');
  expect(loaded.lines, 'Luu lai khong duoc nhan doi dong').toHaveLength(2);
});

it('reads bigint unit_price back as a number (pg returns bigint as string)', async () => {
  const order = OrderBuilder.anOrder().withId('it-big').withoutLines().withLine('GOLD', 1, 3_000_000_000).build();

  await repo.save(order);

  expect((await repo.get('it-big')).lines[0]?.unitPrice.amount).toBe(3_000_000_000);
});

it('database enforces the status check constraint', async () => {
  // A DB constraint is part of the contract that only a real DB can verify.
  await expect(
    client.query("INSERT INTO orders (id, customer_id, status) VALUES ('bad', 'c', 'weird')"),
  ).rejects.toThrow(/orders_status_check/);
});
```

Test thứ hai chính là loại lỗi "lưu lại bị nhân đôi dòng". Test thứ ba là đặc thù Node: `pg` trả `bigint` (OID 20) dưới dạng **string** để không mất độ chính xác, nên adapter chuyển bằng `Number(r.unit_price)`. Cột `timestamptz` thì `pg` tự chuyển thành `Date`, nên `placedAt` đi hết vòng mà không cần code thêm; ta so bằng `toEqual` (so giá trị thời điểm, không phải reference). Một mock của `pg` sẽ không bao giờ cho ta biết hai điều này.

Kết quả chạy thật (PostgreSQL 18, container giới hạn 256 MB):

```
$ ./run.sh integ
 ✓ tests/integration/postgres-order-repository.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Ca `Pool` thật kiểm tra nhánh commit: một connection khác phải thấy dữ liệu sau `save`, điều mà test rollback không thể kiểm tra.

## 6. Trade-offs

- Integration test chậm hơn và cần infrastructure, nhưng là cách duy nhất bắt lỗi mapping/SQL. Một adapter nên có vài chục test, không phải hàng nghìn.
- Đừng test logic domain qua DB: đã có unit test.
- Với ORM/query builder (Prisma, Drizzle, Kysely...): cùng nguyên tắc, DB thật và transaction rollback; chỉ cách lấy connection trong transaction khác nhau theo thư viện (lab dùng `pg` trực tiếp để mọi thứ lộ rõ).

## 7. Pitfalls

- **SQLite in-memory thay Postgres**: test xanh nhưng production đỏ vì khác type/constraint.
- **Dữ liệu dùng chung giữa test**: test này phụ thuộc dữ liệu test kia để lại.
- **Adapter tự `COMMIT` bên trong khi test mở transaction** → rollback không có tác dụng và DB bẩn. Dùng cách phân biệt `Pool` và `PoolClient` như lab, hoặc savepoint.
- **`pool.query('BEGIN')`**: mỗi lệnh có thể chạy trên connection khác, transaction không bao giờ "dính". Luôn `pool.connect()` rồi dùng cùng một client.
- Quên `client.release()` ở `afterEach` khi test lỗi: pool cạn connection và suite treo. Đặt release trong `afterEach`, không đặt trong thân test.
- Chạy test song song (Vitest chạy mỗi file ở một worker) trên cùng một DB mà không isolation (schema/DB riêng cho mỗi worker). Lab chỉ có một file integration, và dùng id tiền tố riêng cho phần commit thật.
- Quên đợi DB sẵn sàng (`pg_isready`) → test đầu tiên flaky.

## 8. Summary

- Adapter cần test với infrastructure thật, cùng loại với production.
- Round trip `save` rồi `get` là bài test cốt lõi; thêm ca cho DB constraint và cho kiểu dữ liệu của driver (`bigint`, `timestamptz`).
- Transaction rollback giữ DB sạch rẻ nhất, nhưng adapter phải tôn trọng transaction ngoài.
- Dựng DB bằng Docker (script hoặc Testcontainers), không map port ra host nếu không cần; lab chọn script vì Testcontainers cần Docker socket khi test chạy trong container.

## 9. Self-check questions

1. Vì sao không dùng SQLite thay PostgreSQL trong integration test của lab?
2. Vì sao `save` kiểm tra `this.#db instanceof pg.Pool`?
3. Liệt kê hai chiến lược dọn dữ liệu và một nhược điểm mỗi cái.
4. Test `saving again updates status and replaces lines` bảo vệ khỏi lỗi gì?
5. Vì sao lab không dùng Testcontainers dù nó tiện hơn?

<details><summary>Answer</summary>

1. SQLite khác PostgreSQL về data type, constraint, `ON CONFLICT`, timezone; test xanh không đảm bảo production đúng.
2. Nếu được đưa một `PoolClient` đã `BEGIN` (test rollback) thì dùng nó thay vì mở/commit riêng, để rollback có hiệu lực; nếu được đưa `Pool` thì tự mở transaction.
3. Rollback: không test được commit thật. TRUNCATE: chậm hơn và phải lo thứ tự FK. (Hoặc DB riêng mỗi test file: chậm.)
4. Lưu lại đơn đã có làm nhân đôi dòng hàng, hoặc không cập nhật trạng thái.
5. Test chạy trong container nên Testcontainers cần mount Docker socket, publish port ngẫu nhiên và chạy thêm container Ryuk; những thứ đó đi ngược quy ước cô lập của lab. Đổi lại lab cần bước `./run.sh up`.
</details>
