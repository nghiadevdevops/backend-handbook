import type { PaymentGateway } from '../application/ports.ts';
import type { Money } from '../domain/money.ts';

/** Programmable fake that also records calls (spy). */
export class FakePaymentGateway implements PaymentGateway {
  readonly charges: { orderId: string; amount: Money }[] = [];
  readonly #willSucceed: boolean;

  constructor(willSucceed = true) {
    this.#willSucceed = willSucceed;
  }

  async charge(orderId: string, amount: Money): Promise<boolean> {
    this.charges.push({ orderId, amount });

    return this.#willSucceed;
  }
}
