/**
 * Tests for status ages and levels.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ageLevel, ageMinutes, ageText, loadStatus } from "../js/status.js";

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

/**
 * Serve fixed JSON documents by URL; anything else is a 404.
 * @param {Record<string, object>} documents
 */
function stubFetch(documents) {
  globalThis.fetch = async (url) => (url in documents
    ? { ok: true, status: 200, json: async () => documents[url] }
    : { ok: false, status: 404 });
}

const ROOT = "https://x.net/outputs/haiti/20260929.170000";
const COUNTRY = { key: "haiti", name: "Haiti" };

test("one unreadable flood summary keeps the cycle status", async () => {
  stubFetch({
    "https://x.net/outputs/haiti/latest.json": { cycle: "20260929.170000", published_utc: "2026-09-29T17:20:00+00:00" },
    [`${ROOT}/index.json`]: { files: [
      { path: "haiti_90m/fim/c/Haiti_Gris/pf_summary.json" },
      { path: "haiti_90m/fim/c/Haiti_LaQuinte/pf_summary.json" },
    ] },
    [`${ROOT}/haiti_90m/fim/c/Haiti_Gris/pf_summary.json`]: { trigger: { triggered: true } },
  });
  const status = await loadStatus("https://x.net/outputs", COUNTRY);
  assert.equal(status.error, undefined);
  assert.equal(status.cycle, "20260929.170000");
  assert.equal(status.sites, 2);
  assert.equal(status.triggered, 1);
  assert.equal(status.unreadSites, 1);
});

test("a country without outputs reports an error instead of throwing", async () => {
  stubFetch({});
  const status = await loadStatus("https://x.net/outputs", COUNTRY);
  assert.match(status.error, /404/);
});
