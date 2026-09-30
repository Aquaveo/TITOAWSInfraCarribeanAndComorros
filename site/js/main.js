/**
 * Page entry point: wires the status board, the controls and the map.
 */

import { COUNTRIES, FLOOD_DEPTHS_CM, IMPACT_LEGEND, LEGENDS } from "./config.js";
import { accessElement, accessUrls } from "./access.js";
import { classifyCells, drawnCount, paintCells } from "./colors.js";
import { element, setOptions } from "./dom.js";
import { buildTree, filterFiles, folderElement, formatBytes } from "./files.js";
import { ViewerMap } from "./map.js";
import { popupElement, riskSummary } from "./impact.js";
import { chosenLayer, siteChoices } from "./layers.js";
import { basinsOf, cycleTime, fetchJson, loadCycle, outputsBase, withoutCountry } from "./outputs.js";
import { loadRaster, rasterBounds } from "./raster.js";
import { loadStatus, statusCard } from "./status.js";

const REFRESH_MS = 5 * 60 * 1000;
const base = outputsBase(window.location);
const form = document.getElementById("controls");
const info = document.getElementById("info");
const filter = document.getElementById("file-filter");
const viewer = new ViewerMap(document.getElementById("map"));
const cycles = new Map();
let drawToken = 0;
let fittedKey = "";
let filesCycle = null;

/**
 * Reload every country's card and the time stamp under the board.
 */
async function refreshStatus() {
  const statuses = await Promise.all(COUNTRIES.map((country) => loadStatus(base, country)));
  const now = new Date();
  document.getElementById("status").replaceChildren(...statuses.map((s) => statusCard(s, now)));
  document.getElementById("stamp").textContent = `Checked ${now.toISOString().slice(11, 16)} UTC, refreshes every 5 minutes`;
}

/**
 * The newest cycle of a country, loaded once per refresh period.
 * A failed load is forgotten so the next request retries it.
 * @param {string} country
 * @returns {Promise<{latest: object, paths: string[], root: string}>}
 */
function countryCycle(country) {
  if (!cycles.has(country)) {
    const pending = loadCycle(base, country);
    cycles.set(country, pending);
    pending.catch(() => {
      if (cycles.get(country) === pending) cycles.delete(country);
    });
  }
  return cycles.get(country);
}

/**
 * Offer the grids and sites that exist in this cycle.
 * @param {{paths: string[]}} cycle
 */
function fillCycleOptions({ paths }) {
  setOptions(form.basin, basinsOf(paths).map((b) => ({ value: b, label: withoutCountry(b) })));
  setOptions(form.site, siteChoices(paths, form.product.value));
}

/**
 * Show only the controls that apply to the chosen product.
 */
function toggleControls() {
  const bySite = ["flood", "impact"].includes(form.product.value);
  for (const name of ["basin", "stat", "period"]) form[name].closest("label").hidden = bySite;
  for (const name of ["site", "depth"]) form[name].closest("label").hidden = !bySite;
}

/**
 * Draw the chosen product. Newer requests win over slower older ones,
 * including their errors.
 */
async function draw() {
  const token = ++drawToken;
  const current = () => token === drawToken;
  try {
    await drawLayer(current);
  } catch (error) {
    if (current()) showError(error);
  }
}

/**
 * Load and show the chosen product, stopping once superseded.
 * @param {() => boolean} current whether this draw is still the newest
 */
async function drawLayer(current) {
  const cycle = await countryCycle(form.country.value);
  if (!current()) return;
  const layer = chosenLayer(cycle.paths, Object.fromEntries(new FormData(form)));
  if (form.product.value === "impact") {
    await drawImpact(cycle, layer, current);
    return;
  }
  viewer.clearFeatures();
  if (!layer.path) {
    showNothing(layer.empty);
    return;
  }
  info.textContent = "Loading…";
  const raster = await loadRaster(`${cycle.root}/${layer.path}`);
  if (!current()) return;
  const legend = LEGENDS[form.product.value];
  const shown = showRaster(raster, legend, layer.key !== fittedKey);
  fittedKey = layer.key;
  viewer.setLegend(legend, layer.note);
  const when = cycleTime(cycle.latest.cycle).toISOString().slice(0, 16).replace("T", " ");
  info.replaceChildren(`Cycle ${when} UTC · ${layer.path.split("/").pop()} · ${shown.toLocaleString("en")} cells shown `,
    openLink(`${cycle.root}/${layer.path}`, "open file"));
}

/**
 * Show a site's municipal impact over its flood probability raster.
 * @param {{root: string}} cycle
 * @param {{path?: string, ibf?: {admin: string, summary: string}, key: string, note: string, empty: string}} layer
 * @param {() => boolean} current whether this draw is still the newest
 */
async function drawImpact(cycle, layer, current) {
  if (!layer.ibf) {
    viewer.clearFeatures();
    showNothing(layer.empty);
    return;
  }
  info.textContent = "Loading…";
  const [raster, admin, summary] = await Promise.all([
    layer.path ? loadRaster(`${cycle.root}/${layer.path}`) : null,
    fetchJson(`${cycle.root}/${layer.ibf.admin}`),
    fetchJson(`${cycle.root}/${layer.ibf.summary}`),
  ]);
  if (!current()) return;
  const fit = layer.key !== fittedKey;
  if (raster) showRaster(raster, LEGENDS.flood, false);
  else viewer.clear();
  viewer.showFeatures(admin, popupElement, fit);
  fittedKey = layer.key;
  viewer.setLegend(IMPACT_LEGEND, layer.note);
  info.replaceChildren(`${riskSummary(summary)} `, openLink(`${cycle.root}/${layer.ibf.admin}`, "open GeoJSON"));
}

/**
 * Colour a raster with its legend and put it on the map.
 * @param {object} raster result of loadRaster
 * @param {{breaks: number[], colors: string[]}} legend
 * @param {boolean} fit zoom to the raster
 * @returns {number} cells drawn
 */
function showRaster(raster, legend, fit) {
  const classes = classifyCells(raster.values, legend.breaks, raster.nodata);
  viewer.show(paintCells(classes, raster.width, raster.height, legend.colors), rasterBounds(raster.bbox, raster.epsg), fit);
  return drawnCount(classes);
}

/**
 * Clear the map and explain why nothing is shown.
 * @param {string} message
 */
function showNothing(message) {
  viewer.clear();
  viewer.setLegend(null);
  info.textContent = message;
}

/**
 * A small link for the info line.
 * @param {string} url
 * @param {string} text
 * @returns {HTMLElement}
 */
function openLink(url, text) {
  const link = element("a", "action", text);
  link.href = url;
  return link;
}

/**
 * Fill the data access box for the selected country's cycle.
 * @param {{latest: object}} cycle
 */
function showAccess(cycle) {
  const country = form.country.value;
  document.getElementById("access").replaceChildren(accessElement(accessUrls(base, country, cycle.latest.cycle), country));
}

/**
 * Show a cycle's file tree, narrowed by the filter box.
 * @param {{files: object[], root: string}} cycle
 */
function showFiles(cycle) {
  filesCycle = cycle;
  const text = filter.value;
  const tree = buildTree(filterFiles(cycle.files, text));
  const note = text.trim() ? ` matching "${text.trim()}"` : "";
  const noun = tree.count === 1 ? "file" : "files";
  document.getElementById("files-summary").textContent = `${tree.count.toLocaleString("en")} ${noun}${note}, ${formatBytes(tree.size)}`;
  document.getElementById("files").replaceChildren(folderElement(tree, cycle.root, Boolean(note)));
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
 * Gives up when another country was picked meanwhile.
 */
async function changeCountry() {
  const country = form.country.value;
  try {
    const cycle = await countryCycle(country);
    if (country !== form.country.value) return;
    fillCycleOptions(cycle);
    showAccess(cycle);
    showFiles(cycle);
  } catch (error) {
    if (country === form.country.value) showError(error);
    return;
  }
  await draw();
}

/**
 * Periodic refresh: forget loaded cycles, reload the cards and move
 * the map to the newest cycle of the selected country.
 */
function refresh() {
  cycles.clear();
  refreshStatus();
  changeCountry();
}

/**
 * Set up controls, first draw and the status refresh timer.
 */
function start() {
  setOptions(form.country, COUNTRIES.map((c) => ({ value: c.key, label: c.name })));
  setOptions(form.depth, FLOOD_DEPTHS_CM.map((d) => ({ value: String(d), label: `${d} cm` })));
  form.country.addEventListener("change", changeCountry);
  filter.addEventListener("input", () => filesCycle && showFiles(filesCycle));
  form.addEventListener("change", async (event) => {
    if (event.target.name === "country") return;
    if (event.target.name === "product") {
      try {
        fillCycleOptions(await countryCycle(form.country.value));
      } catch (error) {
        showError(error);
        return;
      }
    }
    toggleControls();
    draw();
  });
  toggleControls();
  refresh();
  setInterval(refresh, REFRESH_MS);
}

start();
