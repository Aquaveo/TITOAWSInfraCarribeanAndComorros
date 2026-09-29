/**
 * Tests for status ages and levels.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ageLevel, ageMinutes, ageText } from "../js/status.js";

test("age is whole minutes since publication", () => {
  assert.equal(ageMinutes(new Date("2026-09-29T17:00:00Z"), new Date("2026-09-29T17:59:59Z")), 59);
});

test("levels change at 90 and 150 minutes", () => {
  assert.equal(ageLevel(89), "ok");
  assert.equal(ageLevel(90), "late");
  assert.equal(ageLevel(149), "late");
  assert.equal(ageLevel(150), "stale");
});

test("ages read naturally", () => {
  assert.equal(ageText(12), "12 min ago");
  assert.equal(ageText(185), "3 h 5 min ago");
});
