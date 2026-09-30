/**
 * Choosing which raster in a cycle answers the user's control selection.
 */

import { floodLayers, floodPath, ibfSites, summaryPath } from "./outputs.js";

/**
 * The raster for a selection, with its legend note, zoom key and the
 * message to show when the cycle has no such raster.
 * @param {string[]} paths files of the cycle
 * @param {{country: string, product: string, basin: string, stat: string,
 *   period: string, site: string, depth: string}} choice form values
 * @returns {{path: string|undefined, note: string, key: string, empty: string,
 *   ibf?: {admin: string, summary: string}}}
 */
export function chosenLayer(paths, { country, product, basin, stat, period, site, depth }) {
  if (product === "impact") {
    const ibf = ibfSites(paths).find((s) => s.id === site);
    const flood = floodLayers(paths).find((l) => l.id === site);
    return {
      path: flood && floodPath(paths, flood, Number(depth)),
      ibf,
      note: `Municipal risk, over flood probability at ${depth} cm`,
      key: `${country}/${site}`,
      empty: "No impact results in this cycle: no flood site triggered.",
    };
  }
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
 * The sites offered for a product: flood maps list every triggered site
 * and the mosaic; impact lists sites with IBF results.
 * @param {string[]} paths files of the cycle
 * @param {string} product
 * @returns {{value: string, label: string}[]}
 */
export function siteChoices(paths, product) {
  const sites = product === "impact" ? ibfSites(paths) : floodLayers(paths);
  return sites.map((s) => ({ value: s.id, label: s.label }));
}
