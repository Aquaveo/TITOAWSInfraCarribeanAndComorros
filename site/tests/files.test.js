/**
 * Tests for the cycle file tree.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTree, filterFiles, formatBytes } from "../js/files.js";

const FILES = [
  { path: "guatemala_900m/summary/qpeaccum_forecast_median.20260929.220000.tif", size: 120000 },
  { path: "guatemala_900m/summary/maxsm_forecast_median.20260929.220000.tif", size: 80000 },
  { path: "guatemala_900m/scampr/ensOut1/maxq.20260929.220000.tif", size: 900000 },
  { path: "guatemala_90m/ef5_ens02.log", size: 1000 },
];

test("folders total their files and sizes", () => {
  const root = buildTree(FILES);
  assert.equal(root.count, 4);
  assert.equal(root.size, 1101000);
  const coarse = root.folders.get("guatemala_900m");
  assert.equal(coarse.count, 3);
  assert.equal(coarse.folders.get("summary").size, 200000);
  assert.equal(root.folders.get("guatemala_90m").files[0].name, "ef5_ens02.log");
});

test("folders and files are sorted by name", () => {
  const summary = buildTree(FILES).folders.get("guatemala_900m").folders.get("summary");
  assert.deepEqual(summary.files.map((f) => f.name), [
    "maxsm_forecast_median.20260929.220000.tif",
    "qpeaccum_forecast_median.20260929.220000.tif",
  ]);
  assert.deepEqual([...buildTree(FILES).folders.keys()], ["guatemala_900m", "guatemala_90m"]);
});

test("filter matches any part of the path, ignoring case", () => {
  assert.deepEqual(filterFiles(FILES, "SUMMARY").map((f) => f.size), [120000, 80000]);
  assert.equal(filterFiles(FILES, "ensOut1/").length, 1);
  assert.equal(filterFiles(FILES, "  ").length, 4);
  assert.equal(filterFiles(FILES, "nothing").length, 0);
});

test("sizes read in binary units", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(120000), "117 KB");
  assert.equal(formatBytes(385 * 1024 * 1024), "385 MB");
  assert.equal(formatBytes(3.2 * 1024 ** 3), "3.2 GB");
});
