/**
 * Tests for choosing the raster behind a control selection.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { chosenLayer } from "../js/layers.js";

const PATHS = [
  "haiti_900m/summary/maxunitq_forecast_median.20260929.170000.tif",
  "haiti_90m/summary/maxunitq_forecast_median.20260929.170000.tif",
  "haiti_90m/fim/stream_sat_stormlab/Haiti_Gris/combined_overbank/prob_depth_ge_30cm_overbank.20260929.170000.tif",
  "haiti_90m/fim/stream_sat_stormlab/Haiti_LaQuinte/combined_overbank/prob_depth_ge_30cm_overbank.20260929.170000.tif",
];
const CHOICE = {
  country: "haiti", product: "maxunitq", basin: "haiti_90m", stat: "median",
  period: "forecast", site: "Haiti_LaQuinte", depth: "30",
};

test("summary products pick the chosen grid", () => {
  const layer = chosenLayer(PATHS, CHOICE);
  assert.equal(layer.path, PATHS[1]);
  assert.equal(layer.key, "haiti/haiti_90m");
});

test("flood picks the chosen site, not the first one", () => {
  const layer = chosenLayer(PATHS, { ...CHOICE, product: "flood" });
  assert.equal(layer.path, PATHS[3]);
  assert.equal(layer.key, "haiti/Haiti_LaQuinte");
});

test("missing rasters leave no path and explain why", () => {
  assert.equal(chosenLayer(PATHS, { ...CHOICE, product: "maxsm" }).path, undefined);
  const flood = chosenLayer(PATHS, { ...CHOICE, product: "flood", depth: "70" });
  assert.equal(flood.path, undefined);
  assert.match(flood.empty, /No flood site/);
});

test("impact offers only sites with IBF results", async () => {
  const { siteChoices } = await import("../js/layers.js");
  const paths = [...PATHS,
    "haiti_90m/ibf/Haiti_Gris/ibf_admin.20260929.170000.geojson",
    "haiti_90m/ibf/Haiti_Gris/ibf_summary.20260929.170000.json"];
  assert.deepEqual(siteChoices(paths, "impact"), [{ value: "Haiti_Gris", label: "Gris" }]);
  assert.deepEqual(siteChoices(paths, "flood").map((c) => c.value), ["Haiti_Gris", "Haiti_LaQuinte"]);
});
