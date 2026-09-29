/**
 * Page entry point: wires the status board, the controls and the map.
 */

import { COUNTRIES, FLOOD_DEPTHS_CM, LEGENDS } from "./config.js";
import { accessElement, accessUrls } from "./access.js";
import { classifyCells, drawnCount, paintCells } from "./colors.js";
import { element, setOptions } from "./dom.js";
import { buildTree, filterFiles, folderElement, formatBytes } from "./files.js";
import { ViewerMap } from "./map.js";
import { chosenLayer } from "./layers.js";
import { basinsOf, cycleTime, floodLayers, loadCycle, outputsBase, withoutCountry } from "./outputs.js";
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
 * Load, colour and show the chosen raster, stopping once superseded.
 * @param {() => boolean} current whether this draw is still the newest
 */
async function drawLayer(current) {
  const cycle = await countryCycle(form.country.value);
  if (!current()) return;
  const legend = LEGENDS[form.product.value];
  const layer = chosenLayer(cycle.paths, Object.fromEntries(new FormData(form)));
  if (!layer.path) {
    viewer.clear();
    viewer.setLegend(null);
    info.textContent = layer.empty;
    return;
  }
  info.textContent = "Loading…";
  const raster = await loadRaster(`${cycle.root}/${layer.path}`);
  if (!current()) return;
  const bounds = rasterBounds(raster.bbox, raster.epsg);
  const classes = classifyCells(raster.values, legend.breaks, raster.nodata);
  viewer.show(paintCells(classes, raster.width, raster.height, legend.colors), bounds, layer.key !== fittedKey);
  fittedKey = layer.key;
  viewer.setLegend(legend, layer.note);
  const shown = drawnCount(classes);
  const when = cycleTime(cycle.latest.cycle).toISOString().slice(0, 16).replace("T", " ");
  const open = element("a", "action", "open file");
  open.href = `${cycle.root}/${layer.path}`;
  info.replaceChildren(`Cycle ${when} UTC · ${layer.path.split("/").pop()} · ${shown.toLocaleString("en")} cells shown `, open);
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
  form.addEventListener("change", (event) => {
    if (event.target.name === "country") return;
    toggleControls();
    draw();
  });
  toggleControls();
  refresh();
  setInterval(refresh, REFRESH_MS);
}

start();
