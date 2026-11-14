// Lỗi nghiệp vụ. Mã lỗi (code) khớp với cột Exceptions trong specs/use-cases/*.md.
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message = "") {
    super(message ? `${code}: ${message}` : code);
    this.name = "DomainError";
    this.code = code;
  }
}
