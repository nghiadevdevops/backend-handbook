// Chạy use case "đặt mua e-book" chỉ bằng TypeScript thuần + adapter InMemory. Không có NestJS, không có database.
// Script này đóng vai primary adapter (kiểu CLI) gọi vào primary port.

import { SendOrderConfirmationWhenOrderPlaced } from '../src/application/listener/send-order-confirmation-when-order-placed.js';
import { PayOrderHandler } from '../src/application/pay-order/pay-order-handler.js';
import { PlaceOrderHandler } from '../src/application/place-order/place-order-handler.js';
import { Ebook } from '../src/domain/catalog/ebook.js';
import { EbookId } from '../src/domain/catalog/ebook-id.js';
import { EbookPurchasePolicy } from '../src/domain/order/ebook-purchase-policy.js';
import { OrderPlaced } from '../src/domain/order/order-events.js';
import { DomainRuleViolation } from '../src/domain/shared/errors.js';
import { Money } from '../src/domain/shared/money.js';
import { InMemoryEbookCatalog } from '../src/infrastructure/in-memory/in-memory-ebook-catalog.js';
import { InMemoryOrderRepository } from '../src/infrastructure/in-memory/in-memory-order-repository.js';
import { InMemoryOrderSummaryReader } from '../src/infrastructure/in-memory/in-memory-order-summary-reader.js';
import { RecordingOrderNotifier } from '../src/infrastructure/in-memory/recording-order-notifier.js';
import { SynchronousEventPublisher } from '../src/infrastructure/in-memory/synchronous-event-publisher.js';
import { FixedClock } from '../src/infrastructure/time/fixed-clock.js';

// 1. Lắp ráp (composition root)
const orders = new InMemoryOrderRepository();
const catalog = new InMemoryEbookCatalog();
catalog.add(new Ebook(EbookId.of('ddd-101'), 'Domain-Driven Design nhập môn', Money.vnd(120_000)));
catalog.add(new Ebook(EbookId.of('hexa-201'), 'Kiến trúc lục giác', Money.vnd(95_000)));

const clock = new FixedClock(new Date('2026-11-07T09:30:00Z'));
const notifier = new RecordingOrderNotifier();
const events = new SynchronousEventPublisher();
const listener = new SendOrderConfirmationWhenOrderPlaced(notifier);
events.subscribe(OrderPlaced, (event) => listener.handle(event));

const placeOrder = new PlaceOrderHandler(orders, catalog, new EbookPurchasePolicy(orders), clock, events);
const payOrder = new PayOrderHandler(orders, clock, events);
const reader = new InMemoryOrderSummaryReader(orders);

// 2. Đặt đơn
const orderId = await placeOrder.handle({ customerId: 'cus-1', ebookIds: ['ddd-101', 'hexa-201'] });
console.log(`Đã đặt đơn ${orderId}`);
console.log(`Tổng tiền: ${(await orders.get(orderId)).total().format()}`);
console.log(`Thông báo đã gửi: ${notifier.sent.join(', ')}`);

// 3. Thanh toán
await payOrder.handle({ orderId, paymentReference: 'PAY-0001' });
console.log(`Trạng thái: ${(await orders.get(orderId)).status}`);

// 4. Luật nghiệp vụ: không mua lại sách đã sở hữu
try {
  await placeOrder.handle({ customerId: 'cus-1', ebookIds: ['ddd-101'] });
} catch (error) {
  if (!(error instanceof DomainRuleViolation)) throw error;
  console.log(`Bị chặn đúng: ${error.message}`);
}

// 5. Read model
for (const s of await reader.forCustomer('cus-1')) {
  console.log(`Tóm tắt: ${s.status} | ${s.totalAmount} ${s.currency} | ${s.titles.join(' + ')} | ${s.placedAt}`);
}
