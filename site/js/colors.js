/**
 * Turning raster values into legend classes and a coloured image.
 */

/**
 * Legend class of one value, or -1 when it is nodata or below the first break.
 * @param {number} value
 * @param {number[]} breaks ascending class edges
 * @param {number|null} nodata
 * @returns {number}
 */
export function classIndex(value, breaks, nodata) {
  if (!Number.isFinite(value) || value === nodata) return -1;
  for (let i = 0; i < breaks.length - 1; i += 1) {
    if (value >= breaks[i] && value < breaks[i + 1]) return i;
  }
  return -1;
}

/**
 * Parse a #rrggbb colour into [r, g, b].
 * @param {string} hex
 * @returns {number[]}
 */
export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Count cells per legend class, for the legend and the empty-map notice.
 * @param {ArrayLike<number>} values
 * @param {{breaks: number[]}} legend
 * @param {number|null} nodata
 * @returns {number[]}
 */
export function classCounts(values, legend, nodata) {
  const counts = new Array(legend.breaks.length - 1).fill(0);
  for (const value of values) {
    const i = classIndex(value, legend.breaks, nodata);
    if (i >= 0) counts[i] += 1;
  }
  return counts;
}

/**
 * Paint a raster with its legend colours into a PNG data URL.
 * Cells outside every class are left transparent.
 * @param {{values: ArrayLike<number>, width: number, height: number, nodata: number|null}} raster
 * @param {{breaks: number[], colors: string[]}} legend
 * @returns {string}
 */
export function paintRaster({ values, width, height, nodata }, legend) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const rgb = legend.colors.map(hexToRgb);
  for (let cell = 0; cell < values.length; cell += 1) {
    const i = classIndex(values[cell], legend.breaks, nodata);
    if (i < 0) continue;
    image.data.set([...rgb[i], 255], cell * 4);
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
