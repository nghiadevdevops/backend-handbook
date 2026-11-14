/**
 * Vi phạm quy tắc nghiệp vụ: lỗi "dự kiến", adapter bắt có chủ đích rồi dịch ra HTTP 422, thông báo trên CLI...
 */
export class DomainRuleViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Tham số sai kiểu/giá trị (lỗi lập trình hoặc dữ liệu chưa qua validate ở rìa).
 * Khác DomainRuleViolation: đừng catch để "cho êm".
 */
export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
