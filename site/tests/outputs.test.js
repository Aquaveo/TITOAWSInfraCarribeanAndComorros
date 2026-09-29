/**
 * Tests for reading published outputs.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { basinsOf, cycleTime, floodLayers, floodPath, outputsBase, siteSummaryPaths, summaryPath, withoutCountry } from "../js/outputs.js";

const PATHS = [
  "guatemala_90m/summary/qpeaccum_forecast_median.20260929.160000.tif",
  "guatemala_900m/summary/qpeaccum_forecast_median.20260929.160000.tif",
  "guatemala_90m/fim/stream_sat_stormlab/Guatemala_SantaInesPetapa/pf_summary.json",
  "guatemala_90m/fim/stream_sat_stormlab/Guatemala_SantaInesPetapa/combined_overbank/prob_depth_ge_10cm_overbank.20260929.160000.tif",
  "guatemala_90m/fim/stream_sat_stormlab/Guatemala_SantaInesPetapa/pluvial_overbank/prob_depth_ge_10cm_overbank.20260929.160000.tif",
  "comoros_30m/fim/stream_sat_stormlab/Comoros_Pimba/pluvial_overbank/prob_depth_ge_30cm_overbank.20260929.160000.tif",
  "comoros_30m/fim/stream_sat_stormlab/pluvial_overbank/prob_depth_ge_30cm_overbank.20260929.160000.tif",
  "comoros_30m/fim/stream_sat_stormlab/Comoros_Adda/pf_summary.json",
];

test("base defaults to this site's outputs", () => {
  assert.equal(outputsBase({ search: "", hostname: "x.net", origin: "https://x.net" }), "https://x.net/outputs");
});

test("base can be overridden when testing locally", () => {
  const local = { search: "?base=https://cdn.example/outputs/", hostname: "127.0.0.1", origin: "http://127.0.0.1:8766" };
  assert.equal(outputsBase(local), "https://cdn.example/outputs");
});

test("base override is ignored on the public site", () => {
  const site = { search: "?base=https://evil.example/outputs", hostname: "x.net", origin: "https://x.net" };
  assert.equal(outputsBase(site), "https://x.net/outputs");
});

test("cycle folder names parse as UTC", () => {
  assert.equal(cycleTime("20260929.170000").toISOString(), "2026-09-29T17:00:00.000Z");
});

test("grids sort coarsest first", () => {
  assert.deepEqual(basinsOf(PATHS), ["guatemala_900m", "guatemala_90m"]);
});

test("summary path matches grid, product, period and statistic", () => {
  const choice = { basin: "guatemala_90m", product: "qpeaccum", period: "forecast", stat: "median" };
  assert.equal(summaryPath(PATHS, choice), PATHS[0]);
  assert.equal(summaryPath(PATHS, { ...choice, stat: "max" }), undefined);
});

test("flood layers prefer combined over pluvial and include mosaics", () => {
  const layers = floodLayers(PATHS);
  assert.deepEqual(layers.map((l) => l.label), ["All sites (mosaic)", "Pimba", "SantaInesPetapa"]);
  const santa = layers.find((l) => l.id === "Guatemala_SantaInesPetapa");
  assert.match(santa.folder, /combined_overbank$/);
});

test("flood path picks the depth inside the layer folder", () => {
  const mosaic = floodLayers(PATHS).find((l) => l.id === "mosaic");
  assert.equal(floodPath(PATHS, mosaic, 30), PATHS[6]);
  assert.equal(floodPath(PATHS, mosaic, 10), undefined);
});

test("site summaries include quiet sites", () => {
  assert.equal(siteSummaryPaths(PATHS).length, 2);
});

test("country prefixes are stripped from grid and site names", () => {
  assert.equal(withoutCountry("guatemala_90m"), "90m");
  assert.equal(withoutCountry("Haiti_LaQuinte"), "LaQuinte");
});
