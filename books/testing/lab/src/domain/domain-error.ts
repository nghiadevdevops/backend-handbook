/** Business rule violation (not a programming error). */
export class DomainError extends Error {
  override readonly name = 'DomainError';
}
