/**
 * Command message (DTO) theo nghĩa CQS/CQRS: chỉ mang dữ liệu, không có execute().
 * Dùng kiểu nguyên thuỷ để adapter (HTTP, CLI) dựng dễ; handler đổi sang ID branded.
 */
export interface PlaceOrderCommand {
  readonly customerId: string;
  readonly ebookIds: readonly string[];
}
