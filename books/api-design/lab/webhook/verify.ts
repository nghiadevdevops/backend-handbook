// Standard Webhooks v1 (HMAC-SHA256) receiver-side verification, no dependencies.
import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookHeaders = { id: string; timestamp: string; signature: string };

/** `secret` is the `whsec_...` string; the HMAC key is the base64-decoded part after the prefix. */
export function sign(secret: string, id: string, timestamp: number, raw: string | Buffer): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest("base64");
  return `v1,${mac}`;
}

export function verify(secret: string, h: WebhookHeaders, raw: string | Buffer,
                       nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  const ts = Number(h.timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSec - ts) > toleranceSec) return false; // replay window
  const expected = Buffer.from(sign(secret, h.id, ts, raw).slice(3), "base64");
  let ok = false;
  for (const part of h.signature.split(" ")) { // several signatures allow secret rotation
    const [ver, b64] = part.split(",", 2);
    if (ver !== "v1" || b64 === undefined) continue;
    const got = Buffer.from(b64, "base64");
    // timingSafeEqual throws on different lengths, so compare lengths first
    if (got.length === expected.length && timingSafeEqual(got, expected)) ok = true;
  }
  return ok;
}
