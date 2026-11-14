export class OrderNotFound extends Error {
  override readonly name = 'OrderNotFound';

  static withId(id: string): OrderNotFound {
    return new OrderNotFound(`Khong tim thay don ${id}`);
  }
}
