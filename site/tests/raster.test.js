/**
 * Tests for placing rasters on the map.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mercatorToLatLng, rasterBounds } from "../js/raster.js";

test("geographic bounds swap to latitude first", () => {
  assert.deepEqual(rasterBounds([-92.3, 13.7, -88.2, 17.8], 4326), [[13.7, -92.3], [17.8, -88.2]]);
});

test("web mercator converts to degrees", () => {
  const [lat, lng] = mercatorToLatLng(-10077895, 1629000);
  assert.ok(Math.abs(lng - -90.53) < 0.01);
  assert.ok(Math.abs(lat - 14.48) < 0.01);
});

test("other CRSs are refused", () => {
  assert.throws(() => rasterBounds([0, 0, 1, 1], 32615), /EPSG:32615/);
});
