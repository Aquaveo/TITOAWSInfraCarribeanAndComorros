/**
 * Tests for the data access URLs.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { accessSnippet, accessUrls } from "../js/access.js";

test("urls follow the published layout", () => {
  const urls = accessUrls("https://tito.uffis.org/outputs", "haiti", "20260929.220000");
  assert.equal(urls.latest, "https://tito.uffis.org/outputs/haiti/latest.json");
  assert.equal(urls.index, "https://tito.uffis.org/outputs/haiti/20260929.220000/index.json");
  assert.match(urls.file, /\/haiti\/20260929\.220000\/<path from index\.json>$/);
});

test("snippet fetches the selected country from the base", () => {
  const code = accessSnippet("https://tito.uffis.org/outputs", "comoros");
  assert.match(code, /BASE = "https:\/\/tito\.uffis\.org\/outputs"/);
  assert.match(code, /\/comoros\/latest\.json/);
  assert.match(code, /\["files"\]/);
});
