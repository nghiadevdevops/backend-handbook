import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SendOrderConfirmationWhenOrderPlaced } from '../src/application/listener/send-order-confirmation-when-order-placed.js';
import { PayOrderHandler } from '../src/application/pay-order/pay-order-handler.js';
import { PlaceOrderHandler } from '../src/application/place-order/place-order-handler.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { EbookNotFound } from '../src/domain/catalog/ebook-not-found.js';
import { EbookPurchasePolicy } from '../src/domain/order/ebook-purchase-policy.js';
import { AlreadyPurchased } from '../src/domain/order/errors.js';
import { OrderPlaced } from '../src/domain/order/order-events.js';
import { OrderStatus } from '../src/domain/order/order-status.js';
import { Money } from '../src/domain/shared/money.js';
import { InMemoryEbookCatalog } from '../src/infrastructure/in-memory/in-memory-ebook-catalog.js';
import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { InMemoryOrderSummaryReader } from '../src/infrastructure/in-memory/in-memory-order-summary-reader.js';
import { RecordingOrderNotifier } from '../src/infrastructure/in-memory/recording-order-notifier.js';
import { SynchronousEventPublisher } from '../src/infrastructure/in-memory/synchronous-event-publisher.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';

const t0 = new Date('2026-11-07T09:30:00Z');

function setup() {
  const orders = new InMemoryOrderRepository();
  const catalog = new InMemoryEbookCatalog();
  catalog.add(new Ebook(EbookId.of('e1'), 'Sách 1', Money.vnd(100)));
  catalog.add(new Ebook(EbookId.of('e2'), 'Sách 2', Money.vnd(250)));
  const clock = new FixedClock(t0);
  const notifier = new RecordingOrderNotifier();
  const events = new SynchronousEventPublisher();
  const listener = new SendOrderConfirmationWhenOrderPlaced(notifier);
  events.subscribe(OrderPlaced, (event) => listener.handle(event));
  return {
    orders,
    notifier,
    place: new PlaceOrderHandler(orders, catalog, new EbookPurchasePolicy(orders), clock, events),
    pay: new PayOrderHandler(orders, clock, events),
    reader: new InMemoryOrderSummaryReader(orders),
  };
}

describe('Application với adapter InMemory', () => {
  test('Handler lưu đơn với tổng đúng và dùng giờ của Clock', async () => {
    const { place, orders } = setup();
    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    const saved = await orders.get(id);
    assert.equal(saved.total().amount, 350);
    assert.equal(saved.placedAt.getTime(), t0.getTime());
  });

  test('Listener gọi notifier qua port đúng một lần', async () => {
    const { place, notifier } = setup();
    await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    assert.equal(notifier.sent.length, 1);
    assert.match(notifier.sent[0] ?? '', /350 VND/);
  });

  test('E-book không tồn tại', async () => {
    const { place } = setup();
    await assert.rejects(place.handle({ customerId: 'c1', ebookIds: ['zzz'] }), EbookNotFound);
  });

  test('Thanh toán chuyển đơn sang Paid', async () => {
    const { place, pay, orders } = setup();
    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    await pay.handle({ orderId: id, paymentReference: 'PAY-1' });
    assert.equal((await orders.get(id)).status, OrderStatus.Paid);
  });

  test('Không mua lại e-book đã trả tiền', async () => {
    const { place, pay } = setup();
    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    await pay.handle({ orderId: id, paymentReference: 'PAY-1' });
    await assert.rejects(place.handle({ customerId: 'c1', ebookIds: ['e1'] }), AlreadyPurchased);
  });

  test('Khách khác vẫn mua được', async () => {
    const { place, pay } = setup();
    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    await pay.handle({ orderId: id, paymentReference: 'PAY-1' });
    assert.ok(await place.handle({ customerId: 'c2', ebookIds: ['e1'] }));
  });

  test('Read model trả đúng 1 dòng cho c1', async () => {
    const { place, pay, reader } = setup();
    const id = await place.handle({ customerId: 'c1', ebookIds: ['e1', 'e2'] });
    await pay.handle({ orderId: id, paymentReference: 'PAY-1' });
    await place.handle({ customerId: 'c2', ebookIds: ['e1'] });
    const summaries = await reader.forCustomer('c1');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.status, 'paid');
    assert.equal(summaries[0]?.totalAmount, 350);
    assert.equal(summaries[0]?.placedAt, '2026-11-07 09:30');
  });

  test('Dữ liệu sai kiểu lọt qua rìa bị chặn ở handler (TypeScript chỉ kiểm lúc compile)', async () => {
    const { place } = setup();
    // JSON từ ngoài có thể là bất cứ thứ gì; handler đổi sang ID nên kiểm tra lại lúc chạy.
    const bad = { customerId: 123, ebookIds: [] } as unknown as { customerId: string; ebookIds: string[] };
    await assert.rejects(place.handle(bad), { name: 'InvalidArgumentError' });
  });
});
