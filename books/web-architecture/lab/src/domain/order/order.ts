import type { EbookId } from '../catalog/ebook-id.js';
import type { DomainEvent } from '../shared/domain-event.js';
import { DomainRuleViolation, InvalidArgumentError } from '../shared/errors.js';
import { Money } from '../shared/money.js';
import type { CustomerId } from './customer-id.js';
import { OrderPaid, OrderPlaced } from './order-events.js';
import type { OrderId } from './order-id.js';
import type { OrderLine } from './order-line.js';
import { OrderStatus } from './order-status.js';

/**
 * Aggregate root. Tham chiếu Customer bằng CustomerId, Ebook bằng EbookId (qua OrderLine).
 * Mọi quy tắc nghiệp vụ của đơn hàng, kể cả tính tổng tiền, nằm ở đây.
 */
export class Order {
  #events: DomainEvent[] = [];
  readonly #id: OrderId;
  readonly #customerId: CustomerId;
  readonly #lines: readonly OrderLine[];
  #status: OrderStatus;
  readonly #placedAt: Date;
  #paidAt: Date | null;

  private constructor(
    id: OrderId,
    customerId: CustomerId,
    lines: readonly OrderLine[],
    status: OrderStatus,
    placedAt: Date,
    paidAt: Date | null,
  ) {
    this.#id = id;
    this.#customerId = customerId;
    this.#lines = Object.freeze([...lines]);
    this.#status = status;
    // Date của JS sửa tại chỗ được (setHours...), nên luôn giữ bản sao riêng.
    this.#placedAt = new Date(placedAt);
    this.#paidAt = paidAt === null ? null : new Date(paidAt);
  }

  /**
   * Tạo đơn mới. Thời điểm do bên gọi truyền vào (lấy từ Clock ở Application),
   * nên domain không tự đọc đồng hồ.
   */
  static place(id: OrderId, customerId: CustomerId, lines: readonly OrderLine[], placedAt: Date): Order {
    if (lines.length === 0) {
      throw new DomainRuleViolation('Đơn hàng phải có ít nhất một e-book.');
    }
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.ebookId)) {
        throw new DomainRuleViolation(`E-book ${line.ebookId} xuất hiện hai lần trong đơn.`);
      }
      seen.add(line.ebookId);
    }

    const order = new Order(id, customerId, lines, OrderStatus.Pending, placedAt, null);
    order.#events.push(new OrderPlaced(id, customerId, order.total(), placedAt));
    return order;
  }

  /**
   * Dựng lại từ nơi lưu trữ. Không kiểm tra lại luật "tạo mới" và không phát event.
   * Chỉ Repository của hạ tầng nên gọi.
   */
  static reconstitute(
    id: OrderId,
    customerId: CustomerId,
    lines: readonly OrderLine[],
    status: OrderStatus,
    placedAt: Date,
    paidAt: Date | null,
  ): Order {
    return new Order(id, customerId, lines, status, placedAt, paidAt);
  }

  total(): Money {
    const [first] = this.#lines;
    if (first === undefined) {
      throw new InvalidArgumentError('Đơn dựng lại từ nơi lưu trữ không có dòng nào.');
    }
    return this.#lines.reduce((sum, line) => sum.add(line.price), Money.zero(first.price.currency));
  }

  markPaid(paymentReference: string, at: Date): void {
    if (paymentReference.trim() === '') {
      throw new DomainRuleViolation('Thiếu mã tham chiếu thanh toán.');
    }
    if (this.#status !== OrderStatus.Pending) {
      throw new DomainRuleViolation(`Chỉ đơn đang chờ mới thanh toán được (hiện: ${this.#status}).`);
    }
    this.#status = OrderStatus.Paid;
    this.#paidAt = new Date(at);
    this.#events.push(new OrderPaid(this.#id, this.#customerId, at));
  }

  cancel(): void {
    if (this.#status === OrderStatus.Paid) {
      throw new DomainRuleViolation('Đơn đã thanh toán không thể huỷ.');
    }
    this.#status = OrderStatus.Cancelled;
  }

  contains(ebookId: EbookId): boolean {
    return this.#lines.some((line) => line.ebookId === ebookId);
  }

  releaseEvents(): DomainEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  get id(): OrderId {
    return this.#id;
  }

  get customerId(): CustomerId {
    return this.#customerId;
  }

  get lines(): readonly OrderLine[] {
    return this.#lines;
  }

  get status(): OrderStatus {
    return this.#status;
  }

  get placedAt(): Date {
    return new Date(this.#placedAt);
  }

  get paidAt(): Date | null {
    return this.#paidAt === null ? null : new Date(this.#paidAt);
  }

  equals(other: Order): boolean {
    return this.#id === other.#id;
  }
}
