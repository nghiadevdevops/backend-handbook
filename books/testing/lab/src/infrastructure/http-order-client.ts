import type { OrderResponse } from '../application/order-presenter.ts';

/**
 * Consumer-side adapter: how a client (e.g. a web shop) reads an order from order-service.
 * This is the code the Pact consumer test exercises against the Pact mock server.
 */
export class HttpOrderClient {
  readonly #baseUrl: string;
  readonly #token: string;

  constructor(baseUrl: string, token: string) {
    this.#baseUrl = baseUrl;
    this.#token = token;
  }

  async get(id: string): Promise<OrderResponse> {
    const res = await fetch(`${this.#baseUrl}/orders/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${this.#token}`, accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`order-service tra ve ${res.status}`);
    }

    return (await res.json()) as OrderResponse;
  }
}
