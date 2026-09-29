/**
 * Page entry point: wires the status board, the controls and the map.
 */

import { COUNTRIES, FLOOD_DEPTHS_CM, LEGENDS } from "./config.js";
import { classifyCells, drawnCount, paintCells } from "./colors.js";
import { setOptions } from "./dom.js";
import { ViewerMap } from "./map.js";
import { basinsOf, cycleTime, floodLayers, floodPath, loadCycle, outputsBase, summaryPath, withoutCountry } from "./outputs.js";
import { loadRaster, rasterBounds } from "./raster.js";
import { loadStatus, statusCard } from "./status.js";

const REFRESH_MS = 5 * 60 * 1000;
const base = outputsBase(window.location);
const form = document.getElementById("controls");
const info = document.getElementById("info");
const viewer = new ViewerMap(document.getElementById("map"));
const cycles = new Map();
let drawToken = 0;
let fittedKey = "";

/**
 * Reload every country's card and the time stamp under the board.
 * Also forgets loaded cycles, so the next map change uses the newest.
 */
async function refreshStatus() {
  cycles.clear();
  const statuses = await Promise.all(COUNTRIES.map((country) => loadStatus(base, country)));
  const now = new Date();
  document.getElementById("status").replaceChildren(...statuses.map((s) => statusCard(s, now)));
  document.getElementById("stamp").textContent = `Checked ${now.toISOString().slice(11, 16)} UTC, refreshes every 5 minutes`;
}

/**
 * The newest cycle of a country, loaded once per page view.
 * @param {string} country
 * @returns {Promise<{latest: object, paths: string[], root: string}>}
 */
function countryCycle(country) {
  if (!cycles.has(country)) cycles.set(country, loadCycle(base, country));
  return cycles.get(country);
}

/**
 * Offer the grids and flood maps that exist in this cycle.
 * @param {{paths: string[]}} cycle
 */
function fillCycleOptions({ paths }) {
  setOptions(form.basin, basinsOf(paths).map((b) => ({ value: b, label: withoutCountry(b) })));
  setOptions(form.site, floodLayers(paths).map((l) => ({ value: l.id, label: l.label })));
}

/**
 * Show only the controls that apply to the chosen product.
 */
function toggleControls() {
  const flood = form.product.value === "flood";
  for (const name of ["basin", "stat", "period"]) form[name].closest("label").hidden = flood;
  for (const name of ["site", "depth"]) form[name].closest("label").hidden = !flood;
}

/**
 * The raster path, legend note and zoom key for the current choice.
 * @param {{paths: string[]}} cycle
 * @returns {{path: string|undefined, note: string, key: string, empty: string}}
 */
function chosenLayer({ paths }) {
  const { country, product, basin, stat, period, site, depth } = Object.fromEntries(new FormData(form));
  if (product === "flood") {
    const layer = floodLayers(paths).find((l) => l.id === site);
    return {
      path: layer && floodPath(paths, layer, Number(depth)),
      note: `Depth at least ${depth} cm, overbank view`,
      key: `${country}/${site}`,
      empty: "No flood site triggered in this cycle.",
    };
  }
  return {
    path: summaryPath(paths, { basin, product, period, stat }),
    note: `Ensemble ${stat}, ${period}`,
    key: `${country}/${basin}`,
    empty: "This product is not produced for this country.",
  };
}

/**
 * Draw the chosen product; newer requests win over slower older ones.
 */
async function draw() {
  const token = ++drawToken;
  const cycle = await countryCycle(form.country.value);
  if (token !== drawToken) return;
  const legend = LEGENDS[form.product.value];
  const layer = chosenLayer(cycle);
  if (!layer.path) {
    viewer.clear();
    viewer.setLegend(null);
    info.textContent = layer.empty;
    return;
  }
  info.textContent = "Loading…";
  const raster = await loadRaster(`${cycle.root}/${layer.path}`);
  if (token !== drawToken) return;
  const bounds = rasterBounds(raster.bbox, raster.epsg);
  const classes = classifyCells(raster.values, legend.breaks, raster.nodata);
  viewer.show(paintCells(classes, raster.width, raster.height, legend.colors), bounds, layer.key !== fittedKey);
  fittedKey = layer.key;
  viewer.setLegend(legend, layer.note);
  const shown = drawnCount(classes);
  const when = cycleTime(cycle.latest.cycle).toISOString().slice(0, 16).replace("T", " ");
  info.textContent = `Cycle ${when} UTC · ${layer.path.split("/").pop()} · ${shown.toLocaleString("en")} cells shown`;
}

/**
 * Report a failed draw in the info line instead of failing silently.
 * @param {Error} error
 */
function showError(error) {
  info.textContent = `Could not load this layer: ${error.message}`;
}

/**
 * React to a country change: new cycle, new options, redraw.
 */
async function changeCountry() {
  const cycle = await countryCycle(form.country.value);
  fillCycleOptions(cycle);
  await draw();
}

/**
 * Set up controls, first draw and the status refresh timer.
 */
function start() {
  setOptions(form.country, COUNTRIES.map((c) => ({ value: c.key, label: c.name })));
  setOptions(form.depth, FLOOD_DEPTHS_CM.map((d) => ({ value: String(d), label: `${d} cm` })));
  form.country.addEventListener("change", () => changeCountry().catch(showError));
  form.addEventListener("change", (event) => {
    if (event.target.name === "country") return;
    toggleControls();
    draw().catch(showError);
  });
  toggleControls();
  changeCountry().catch(showError);
  refreshStatus();
  setInterval(refreshStatus, REFRESH_MS);
}

start();
