// Acceptance tests cho UC-002. Tên test = AC-002-n trong specs/use-cases/UC-002-cancel-booking.md.
import assert from "node:assert/strict";
import { test } from "node:test";

import { FixedClock } from "../../src/adapters/in-memory.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { at, makeEnv } from "./fixture.ts";

const code = (c: string) => (e: unknown) => e instanceof DomainError && e.code === c;

test("test_ac_002_1_cancel_at_least_120_minutes_before_is_free", () => {
  const env = makeEnv();
  const b = env.book(at(9, 9), at(9, 10)); // now 07:00 -> còn đúng 120 phút
  const out = env.cancel.execute({ member_id: "M1", booking_id: b.booking_id });
  assert.equal(out.status, "CANCELLED");
  assert.equal(out.late_cancel, false);
});

test("test_ac_002_2_cancel_under_120_minutes_marks_late", () => {
  const env = makeEnv();
  const b = env.book(at(9, 8, 30), at(9, 9, 30)); // còn 90 phút
  const out = env.cancel.execute({ member_id: "M1", booking_id: b.booking_id });
  assert.equal(out.status, "CANCELLED");
  assert.equal(out.late_cancel, true);
});

test("test_ac_002_3_only_owner_can_cancel", () => {
  const env = makeEnv();
  const b = env.book(at(9, 9), at(9, 10));
  assert.throws(
    () => env.cancel.execute({ member_id: "M2", booking_id: b.booking_id }),
    code("FORBIDDEN"),
  );
});

test("test_ac_002_4_cannot_cancel_started_booking", () => {
  const env = makeEnv();
  const b = env.book(at(9, 9), at(9, 10));
  const cancel = env.cancelAt(new FixedClock(at(9, 9, 30))); // đồng hồ đã qua giờ bắt đầu
  assert.throws(
    () => cancel.execute({ member_id: "M1", booking_id: b.booking_id }),
    code("ALREADY_STARTED"),
  );
});

test("test_ac_002_5_cancelling_twice_is_rejected", () => {
  const env = makeEnv();
  const b = env.book(at(9, 9), at(9, 10));
  env.cancel.execute({ member_id: "M1", booking_id: b.booking_id });
  assert.throws(
    () => env.cancel.execute({ member_id: "M1", booking_id: b.booking_id }),
    code("ALREADY_CANCELLED"),
  );
});
