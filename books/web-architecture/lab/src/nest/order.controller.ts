import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PlaceOrderUseCase } from '../application/port/in/place-order-use-case.js';
import type { OrderSummary } from '../application/query/order-summary.js';
import type { OrderSummaryReader } from '../application/query/order-summary-reader.js';
import { DomainRuleViolation } from '../domain/shared/errors.js';
import { PlaceOrderDto } from './place-order.dto.js';
import { ORDER_SUMMARY_READER, PLACE_ORDER_USE_CASE } from './tokens.js';

/**
 * Primary (driving) adapter: dịch HTTP thành Command rồi GỌI vào primary port.
 * Nó không implement port và không chứa luật nghiệp vụ.
 *
 * Danh tính khách lấy từ header x-customer-id để ví dụ gọn; ứng dụng thật dùng Guard
 * xác thực (JWT, session...) rồi đặt customerId vào request.
 */
@Controller('orders')
export class OrderController {
  constructor(
    @Inject(PLACE_ORDER_USE_CASE) private readonly placeOrder: PlaceOrderUseCase,
    @Inject(ORDER_SUMMARY_READER) private readonly reader: OrderSummaryReader,
  ) {}

  @Get()
  async index(@Headers('x-customer-id') customerId: string | undefined): Promise<readonly OrderSummary[]> {
    return this.reader.forCustomer(this.requireCustomer(customerId));
  }

  @Post()
  @HttpCode(201)
  async store(
    @Headers('x-customer-id') customerId: string | undefined,
    @Body() body: PlaceOrderDto,
  ): Promise<{ orderId: string }> {
    try {
      const orderId = await this.placeOrder.handle({
        customerId: this.requireCustomer(customerId),
        ebookIds: body.ebookIds,
      });
      return { orderId };
    } catch (error) {
      if (error instanceof DomainRuleViolation) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }

  private requireCustomer(customerId: string | undefined): string {
    if (customerId === undefined || customerId.trim() === '') {
      throw new UnauthorizedException('Thiếu danh tính khách.');
    }
    return customerId;
  }
}
