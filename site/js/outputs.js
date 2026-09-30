/**
 * Reading published TITO outputs: latest.json, the per-cycle index.json,
 * and finding product files inside a cycle.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Base URL of the outputs tree: this site's own /outputs. On a local
 * host a ?base= query parameter may point elsewhere, for testing; the
 * public site ignores it so links cannot swap in other data.
 * @param {Location} location
 * @returns {string}
 */
export function outputsBase(location) {
  const local = LOCAL_HOSTS.has(location.hostname);
  const override = local ? new URLSearchParams(location.search).get("base") : null;
  return (override || `${location.origin}/outputs`).replace(/\/$/, "");
}

/**
 * Fetch a URL and fail on any non-2xx status. Sends no cache headers:
 * CloudFront drops its CORS header when a request carries them, and it
 * already marks latest.json as no-cache.
 * @param {string} url
 * @returns {Promise<Response>}
 */
export async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response;
}

/**
 * Fetch and parse a JSON document.
 * @param {string} url
 * @returns {Promise<any>}
 */
export async function fetchJson(url) {
  return (await fetchOk(url)).json();
}

/**
 * Load a country's newest cycle: its latest.json and index.json.
 * @param {string} base
 * @param {string} country
 * @returns {Promise<{latest: object, files: {path: string, size: number}[], paths: string[], root: string}>}
 */
export async function loadCycle(base, country) {
  const latest = await fetchJson(`${base}/${country}/latest.json`);
  const root = `${base}/${country}/${latest.cycle}`;
  const index = await fetchJson(`${root}/index.json`);
  return { latest, files: index.files, paths: index.files.map((file) => file.path), root };
}

/**
 * Start time of a cycle folder name such as 20260929.170000, in UTC.
 * @param {string} cycle
 * @returns {Date}
 */
export function cycleTime(cycle) {
  const [, y, mo, d, h, mi, s] = cycle.match(/^(\d{4})(\d{2})(\d{2})\.(\d{2})(\d{2})(\d{2})$/);
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * Model grids in a cycle, coarsest first (e.g. guatemala_900m, guatemala_90m).
 * @param {string[]} paths
 * @returns {string[]}
 */
export function basinsOf(paths) {
  const basins = new Set(paths.filter((p) => p.includes("/summary/")).map((p) => p.split("/")[0]));
  return [...basins].sort((a, b) => resolutionOf(b) - resolutionOf(a));
}

/**
 * A folder or site name without its country prefix,
 * e.g. guatemala_90m to 90m, Haiti_LaQuinte to LaQuinte.
 * @param {string} name
 * @returns {string}
 */
export function withoutCountry(name) {
  return name.replace(/^[^_]+_/, "");
}

/**
 * Grid resolution in metres from a basin folder name.
 * @param {string} basin
 * @returns {number}
 */
function resolutionOf(basin) {
  const match = basin.match(/_(\d+)m$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Path of one ensemble summary raster, or undefined when absent.
 * @param {string[]} paths
 * @param {{basin: string, product: string, period: string, stat: string}} choice
 * @returns {string|undefined}
 */
export function summaryPath(paths, { basin, product, period, stat }) {
  const prefix = `${basin}/summary/${product}_${period}_${stat}.`;
  return paths.find((p) => p.startsWith(prefix) && p.endsWith(".tif"));
}

const FLOOD_RASTER = /^(.+\/fim\/[^/]+\/(?:([^/]+)\/)?(combined|pluvial)_overbank)\/prob_depth_ge_\d+cm_overbank\./;

/**
 * Flood maps in a cycle, one per triggered site plus any country mosaic.
 * Each site uses its combined overbank view, or pluvial when that is all
 * the site models.
 * @param {string[]} paths
 * @returns {{id: string, label: string, folder: string}[]}
 */
export function floodLayers(paths) {
  const layers = new Map();
  for (const path of paths) {
    const match = path.match(FLOOD_RASTER);
    if (!match) continue;
    const [, folder, site, hazard] = match;
    const id = site || "mosaic";
    if (layers.has(id) && hazard === "pluvial") continue;
    layers.set(id, { id, label: site ? withoutCountry(site) : "All sites (mosaic)", folder });
  }
  return [...layers.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Path of a flood map's probability raster for one depth.
 * @param {string[]} paths
 * @param {{folder: string}} layer
 * @param {number} depthCm
 * @returns {string|undefined}
 */
export function floodPath(paths, layer, depthCm) {
  const prefix = `${layer.folder}/prob_depth_ge_${depthCm}cm_overbank.`;
  return paths.find((p) => p.startsWith(prefix));
}

const IBF_FILE = /^(.+\/ibf\/([^/]+))\/ibf_(admin|summary)\.[\d.]+\.(geojson|json)$/;

/**
 * Sites with impact results: each needs its admin GeoJSON and summary.
 * @param {string[]} paths
 * @returns {{id: string, label: string, admin: string, summary: string}[]}
 */
export function ibfSites(paths) {
  const sites = new Map();
  for (const path of paths) {
    const match = path.match(IBF_FILE);
    if (!match) continue;
    const [, , id, kind] = match;
    const site = sites.get(id) || { id, label: withoutCountry(id) };
    site[kind] = path;
    sites.set(id, site);
  }
  return [...sites.values()].filter((s) => s.admin && s.summary).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Paths of every site's pf_summary.json, triggered or quiet.
 * @param {string[]} paths
 * @returns {string[]}
 */
export function siteSummaryPaths(paths) {
  return paths.filter((p) => p.endsWith("/pf_summary.json"));
}
