/**
 * Tests for legend classes and colours.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCells, classIndex, drawnCount, hexToRgb } from "../js/colors.js";
import { LEGENDS } from "../js/config.js";

test("values fall in half-open classes", () => {
  const { breaks } = LEGENDS.qpeaccum;
  assert.equal(classIndex(1, breaks, -9999), 0);
  assert.equal(classIndex(4.99, breaks, -9999), 0);
  assert.equal(classIndex(5, breaks, -9999), 1);
  assert.equal(classIndex(900, breaks, -9999), 8);
});

test("nodata, NaN and values below the first class are not drawn", () => {
  const { breaks } = LEGENDS.qpeaccum;
  assert.equal(classIndex(-9999, breaks, -9999), -1);
  assert.equal(classIndex(Number.NaN, breaks, null), -1);
  assert.equal(classIndex(0.5, breaks, null), -1);
});

test("full saturation and certain flooding are drawn", () => {
  assert.equal(classIndex(100, LEGENDS.maxsm.breaks, null), 5);
  assert.equal(classIndex(1, LEGENDS.flood.breaks, null), 3);
});

test("every legend has one colour and label per class", () => {
  for (const legend of Object.values(LEGENDS)) {
    assert.equal(legend.colors.length, legend.breaks.length - 1);
    assert.equal(legend.labels.length, legend.colors.length);
  }
});

test("cells classify once and undrawn ones are not counted", () => {
  const classes = classifyCells([0.01, 0.1, 0.3, 0.9, -9999], LEGENDS.flood.breaks, -9999);
  assert.deepEqual([...classes], [-1, 0, 1, 3, -1]);
  assert.equal(drawnCount(classes), 3);
});

test("hex colours parse to rgb", () => {
  assert.deepEqual(hexToRgb("#3f51d8"), [63, 81, 216]);
});
