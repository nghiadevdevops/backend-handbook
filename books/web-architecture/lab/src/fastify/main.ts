import pg from 'pg';
import { SendOrderConfirmationWhenOrderPlaced } from '../application/listener/send-order-confirmation-when-order-placed.js';
import { PlaceOrderHandler } from '../application/place-order/place-order-handler.js';
import { EbookPurchasePolicy } from '../domain/order/ebook-purchase-policy.js';
import { OrderPlaced } from '../domain/order/order-events.js';
import { RecordingOrderNotifier } from '../infrastructure/in-memory/recording-order-notifier.js';
import { SynchronousEventPublisher } from '../infrastructure/in-memory/synchronous-event-publisher.js';
import { PgEbookCatalog } from '../infrastructure/postgres/pg-ebook-catalog.js';
import { PgOrderRepository } from '../infrastructure/postgres/pg-order-repository.js';
import { PgOrderSummaryReader } from '../infrastructure/postgres/pg-order-summary-reader.js';
import { SystemClock } from '../infrastructure/time/system-clock.js';
import { buildApp } from './build-app.js';

// Composition root viết tay: một file, đọc từ trên xuống là biết ai nối với ai.
const pool = new pg.Pool({ connectionString: process.env['DATABASE_URL'] });
const orders = new PgOrderRepository(pool);
const notifier = new RecordingOrderNotifier(); // thay bằng adapter gửi thật
const events = new SynchronousEventPublisher();
const confirmation = new SendOrderConfirmationWhenOrderPlaced(notifier);
events.subscribe(OrderPlaced, (event) => confirmation.handle(event));

const placeOrder = new PlaceOrderHandler(
  orders,
  new PgEbookCatalog(pool),
  new EbookPurchasePolicy(orders),
  new SystemClock(),
  events,
);

const app = buildApp({ placeOrder, reader: new PgOrderSummaryReader(pool) });
await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: '0.0.0.0' });
