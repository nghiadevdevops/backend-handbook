// Acceptance tests cho UC-001. Tên test = AC-001-n trong specs/use-cases/UC-001-create-booking.md.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DomainError } from "../../src/domain/errors.ts";
import { at, makeEnv } from "./fixture.ts";

const code = (c: string) => (e: unknown) => e instanceof DomainError && e.code === c;

test("test_ac_001_1_creates_confirmed_booking", () => {
  const env = makeEnv();
  const b = env.create.execute(env.cmd(at(9, 9), at(9, 11)));
  assert.equal(b.status, "CONFIRMED");
  assert.equal(b.slot.duration_minutes, 120);
});

test("test_ac_001_2_rejects_overlapping_slot", () => {
  const env = makeEnv();
  env.create.execute(env.cmd(at(9, 9), at(9, 11)));
  assert.throws(
    () => env.create.execute(env.cmd(at(9, 10), at(9, 12), { member: "M2" })),
    code("BOOKING_OVERLAP"),
  );
});

test("test_ac_001_3_rejects_outside_opening_hours", () => {
  const env = makeEnv();
  assert.throws(() => env.create.execute(env.cmd(at(9, 17), at(9, 19))), code("OUTSIDE_OPENING_HOURS"));
});

test("test_ac_001_4_rejects_duration_over_240_minutes", () => {
  const env = makeEnv();
  assert.throws( // 270 phút
    () => env.create.execute(env.cmd(at(9, 8), at(9, 12, 30))),
    code("DURATION_TOO_LONG"),
  );
});

test("test_ac_001_5_rejects_fourth_upcoming_booking", () => {
  const env = makeEnv();
  for (const h of [8, 10, 12]) env.create.execute(env.cmd(at(9, h), at(9, h + 1)));
  assert.throws(() => env.create.execute(env.cmd(at(9, 14), at(9, 15))), code("QUOTA_EXCEEDED"));
});

test("test_ac_001_6_rejects_attendees_over_capacity", () => {
  const env = makeEnv();
  assert.throws(
    () => env.create.execute(env.cmd(at(9, 9), at(9, 10), { n: 7 })),
    code("CAPACITY_EXCEEDED"),
  );
});

test("test_ac_001_7_allows_back_to_back_bookings", () => {
  const env = makeEnv();
  env.create.execute(env.cmd(at(9, 9), at(9, 10)));
  const b = env.create.execute(env.cmd(at(9, 10), at(9, 11), { member: "M2" }));
  assert.equal(b.status, "CONFIRMED");
});

test("test_ac_001_8_rejects_start_in_past", () => {
  const env = makeEnv();
  assert.throws(() => env.create.execute(env.cmd(at(9, 6), at(9, 7))), code("START_IN_PAST")); // now = 07:00
});
