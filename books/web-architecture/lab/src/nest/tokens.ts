// DI token cho từng port. Interface của TypeScript biến mất lúc chạy nên Nest cần một "giá trị"
// làm khoá tra container. Token nằm ở lớp NestJS (infrastructure), không nằm trong core.

export const ORDER_REPOSITORY = Symbol('OrderRepository');
export const EBOOK_CATALOG = Symbol('EbookCatalog');
export const ORDER_SUMMARY_READER = Symbol('OrderSummaryReader');
export const CLOCK = Symbol('Clock');
export const EVENT_PUBLISHER = Symbol('EventPublisher');
export const ORDER_NOTIFIER = Symbol('OrderNotifier');

export const PLACE_ORDER_USE_CASE = Symbol('PlaceOrderUseCase');
export const PAY_ORDER_USE_CASE = Symbol('PayOrderUseCase');
export const SEND_ORDER_CONFIRMATION = Symbol('SendOrderConfirmationWhenOrderPlaced');

export const PG_POOL = Symbol('PgPool');
