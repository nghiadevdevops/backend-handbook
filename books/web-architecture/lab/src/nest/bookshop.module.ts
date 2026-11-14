import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Pool } from 'pg';
import { SendOrderConfirmationWhenOrderPlaced } from '../application/listener/send-order-confirmation-when-order-placed.js';
import { PayOrderHandler } from '../application/pay-order/pay-order-handler.js';
import { PlaceOrderHandler } from '../application/place-order/place-order-handler.js';
import type { Clock } from '../application/port/out/clock.js';
import type { EventPublisher } from '../application/port/out/event-publisher.js';
import type { OrderNotifier } from '../application/port/out/order-notifier.js';
import type { EbookCatalog } from '../domain/catalog/ebook-catalog.js';
import { EbookPurchasePolicy } from '../domain/order/ebook-purchase-policy.js';
import type { OrderRepository } from '../domain/order/order-repository.js';
import { PgEbookCatalog } from '../infrastructure/postgres/pg-ebook-catalog.js';
import { PgOrderRepository } from '../infrastructure/postgres/pg-order-repository.js';
import { PgOrderSummaryReader } from '../infrastructure/postgres/pg-order-summary-reader.js';
import { SystemClock } from '../infrastructure/time/system-clock.js';
import { LogOrderNotifier } from './log-order-notifier.js';
import { NestEventPublisher } from './nest-event-publisher.js';
import { OrderConfirmationSubscriber } from './order-confirmation.subscriber.js';
import { OrderController } from './order.controller.js';
import { PgPoolLifecycle } from './pg-pool.lifecycle.js';
import {
  CLOCK,
  EBOOK_CATALOG,
  EVENT_PUBLISHER,
  ORDER_NOTIFIER,
  ORDER_REPOSITORY,
  ORDER_SUMMARY_READER,
  PAY_ORDER_USE_CASE,
  PG_POOL,
  PLACE_ORDER_USE_CASE,
  SEND_ORDER_CONFIRMATION,
} from './tokens.js';

/**
 * Composition root phía NestJS: nối port với adapter.
 * Handler và listener của core là class TypeScript thuần (không có @Injectable),
 * nên được dựng bằng useFactory + inject theo token.
 */
@Module({
  imports: [EventEmitterModule.forRoot()],
  controllers: [OrderController],
  providers: [
    // Hạ tầng dùng chung
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: process.env['DATABASE_URL'] }) },
    PgPoolLifecycle,
    NestEventPublisher,
    OrderConfirmationSubscriber,

    // Secondary port -> adapter (mặc định provider là singleton trong Nest)
    { provide: ORDER_REPOSITORY, useFactory: (pool: Pool) => new PgOrderRepository(pool), inject: [PG_POOL] },
    { provide: EBOOK_CATALOG, useFactory: (pool: Pool) => new PgEbookCatalog(pool), inject: [PG_POOL] },
    { provide: ORDER_SUMMARY_READER, useFactory: (pool: Pool) => new PgOrderSummaryReader(pool), inject: [PG_POOL] },
    { provide: CLOCK, useClass: SystemClock },
    { provide: EVENT_PUBLISHER, useExisting: NestEventPublisher },
    { provide: ORDER_NOTIFIER, useClass: LogOrderNotifier },

    // Primary port -> handler của core
    {
      provide: PLACE_ORDER_USE_CASE,
      useFactory: (orders: OrderRepository, catalog: EbookCatalog, clock: Clock, events: EventPublisher) =>
        new PlaceOrderHandler(orders, catalog, new EbookPurchasePolicy(orders), clock, events),
      inject: [ORDER_REPOSITORY, EBOOK_CATALOG, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: PAY_ORDER_USE_CASE,
      useFactory: (orders: OrderRepository, clock: Clock, events: EventPublisher) =>
        new PayOrderHandler(orders, clock, events),
      inject: [ORDER_REPOSITORY, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: SEND_ORDER_CONFIRMATION,
      useFactory: (notifier: OrderNotifier) => new SendOrderConfirmationWhenOrderPlaced(notifier),
      inject: [ORDER_NOTIFIER],
    },
  ],
  exports: [PLACE_ORDER_USE_CASE, PAY_ORDER_USE_CASE],
})
export class BookshopModule {}
