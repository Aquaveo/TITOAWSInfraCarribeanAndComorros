/**
 * Choosing which raster in a cycle answers the user's control selection.
 */

import { floodLayers, floodPath, summaryPath } from "./outputs.js";

/**
 * The raster for a selection, with its legend note, zoom key and the
 * message to show when the cycle has no such raster.
 * @param {string[]} paths files of the cycle
 * @param {{country: string, product: string, basin: string, stat: string,
 *   period: string, site: string, depth: string}} choice form values
 * @returns {{path: string|undefined, note: string, key: string, empty: string}}
 */
export function chosenLayer(paths, { country, product, basin, stat, period, site, depth }) {
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
