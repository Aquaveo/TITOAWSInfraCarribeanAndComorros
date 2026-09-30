/**
 * Tests for reading IBF impact results.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { exposure, riskSummary } from "../js/impact.js";
import { ibfSites } from "../js/outputs.js";
import { chosenLayer } from "../js/layers.js";

const ADMIN = {
  ADM_NAME: "Villa Canales", risk_level: "HIGH", total_pop: 155423.09,
  hzrd_0_total_pop: 9777.54, hzrd_1_total_pop: 1008.03, hzrd_2_total_pop: 196.33, hzrd_3_total_pop: 40.75, hzrd_4_total_pop: 130.55,
  hzrd_0_bldg_count: 4105, hzrd_1_bldg_count: 260, hzrd_2_bldg_count: 74, hzrd_3_bldg_count: 13, hzrd_4_bldg_count: 71,
  hzrd_0_rd_len_m: 29226.3, hzrd_1_rd_len_m: 7764.37, hzrd_2_rd_len_m: 2991.63, hzrd_3_rd_len_m: 248.02, hzrd_4_rd_len_m: 2026.53,
};

test("exposure sums hazard classes 1 to 4 and skips class 0", () => {
  const e = exposure(ADMIN);
  assert.equal(Math.round(e.population), 1376);
  assert.equal(e.buildings, 418);
  assert.equal(Math.round(e.roadsKm * 10) / 10, 13.0);
});

test("exposure treats missing classes as zero", () => {
  assert.deepEqual(exposure({ hzrd_0_total_pop: 5, hzrd_1_bldg_count: 2 }), { population: 0, buildings: 2, roadsKm: 0 });
});

test("risk summary lists levels from high to low and people at low or worse", () => {
  const text = riskSummary({
    buildings_by_risk: { "VERY LOW": 5123, LOW: 341, MEDIUM: 140, HIGH: 82 },
    population_at_yellow_or_worse: 1765.07,
  });
  assert.equal(text, "Buildings at risk: 82 high, 140 medium, 341 low. People at low risk or worse: 1,765.");
});

const PATHS = [
  "guatemala_90m/fim/stream_sat_stormlab/Guatemala_SIP/combined_overbank/prob_depth_ge_30cm_overbank.20260930.210000.tif",
  "guatemala_90m/ibf/Guatemala_SIP/ibf_admin.20260930.210000.geojson",
  "guatemala_90m/ibf/Guatemala_SIP/ibf_admin.20260930.210000.parquet",
  "guatemala_90m/ibf/Guatemala_SIP/ibf_summary.20260930.210000.json",
  "antigua_30m/ibf/Antigua_Quiet/ibf_summary.20260930.210000.json",
];

test("ibf sites need both the admin GeoJSON and the summary", () => {
  assert.deepEqual(ibfSites(PATHS), [{
    id: "Guatemala_SIP", label: "SIP",
    admin: "guatemala_90m/ibf/Guatemala_SIP/ibf_admin.20260930.210000.geojson",
    summary: "guatemala_90m/ibf/Guatemala_SIP/ibf_summary.20260930.210000.json",
  }]);
});

test("impact layer pairs the site's flood raster with its IBF files", () => {
  const layer = chosenLayer(PATHS, { country: "guatemala", product: "impact", site: "Guatemala_SIP", depth: "30" });
  assert.equal(layer.path, PATHS[0]);
  assert.equal(layer.ibf.admin, PATHS[1]);
  assert.equal(layer.key, "guatemala/Guatemala_SIP");
  const none = chosenLayer(PATHS, { country: "guatemala", product: "impact", site: "Other", depth: "30" });
  assert.equal(none.ibf, undefined);
  assert.match(none.empty, /No impact results/);
});

test("municipality names come from ADM_NAME or ADMn_EN, then the code", async () => {
  const { adminName } = await import("../js/impact.js");
  assert.equal(adminName({ ADM_NAME: "Bassin", ADM_ID: "HTI.3" }), "Bassin");
  assert.equal(adminName({ ADM1_PCODE: "AG03", ADM1_EN: "Saint George" }), "Saint George");
  assert.equal(adminName({ ADM1_PCODE: "AG03" }), "AG03");
  assert.equal(adminName({}), "Municipality");
});
