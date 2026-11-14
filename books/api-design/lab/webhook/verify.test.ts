import { test } from "node:test";
import assert from "node:assert/strict";
import { sign, verify } from "./verify.ts";

const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const body = '{"type":"order.created","data":{"id":"ord_0001"}}';
const now = 1_800_000_000;
const sig = sign(secret, "evt_1", now, body);
const h = { id: "evt_1", timestamp: String(now), signature: sig };

test("valid signature", () => assert.equal(verify(secret, h, body, now), true));
test("tampered body is rejected", () => assert.equal(verify(secret, h, body + " ", now), false));
test("wrong secret is rejected", () => {
  const other = "whsec_" + Buffer.from("x".repeat(32)).toString("base64");
  assert.equal(verify(other, h, body, now), false);
});
test("timestamp outside window is rejected", () => assert.equal(verify(secret, h, body, now + 301), false));
test("timestamp inside window is accepted", () => assert.equal(verify(secret, h, body, now + 299), true));
test("rotation: second signature in header matches", () => {
  const rotated = { ...h, signature: `v1,${Buffer.from("junk").toString("base64")} ${sig}` };
  assert.equal(verify(secret, rotated, body, now), true);
});
test("garbage signature of other length does not throw", () => {
  assert.equal(verify(secret, { ...h, signature: "v1,AAAA" }, body, now), false);
});
test("unknown version is ignored", () => {
  assert.equal(verify(secret, { ...h, signature: sig.replace("v1,", "v2,") }, body, now), false);
});
