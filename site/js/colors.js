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
 * Legend class of every cell, -1 where nothing is drawn.
 * @param {ArrayLike<number>} values
 * @param {number[]} breaks
 * @param {number|null} nodata
 * @returns {Int8Array}
 */
export function classifyCells(values, breaks, nodata) {
  const classes = new Int8Array(values.length);
  for (let cell = 0; cell < values.length; cell += 1) {
    classes[cell] = classIndex(values[cell], breaks, nodata);
  }
  return classes;
}

/**
 * Number of cells that are drawn.
 * @param {Int8Array} classes result of classifyCells
 * @returns {number}
 */
export function drawnCount(classes) {
  let count = 0;
  for (const i of classes) if (i >= 0) count += 1;
  return count;
}

/**
 * Paint classified cells with their legend colours into a PNG data URL.
 * Undrawn cells stay transparent.
 * @param {Int8Array} classes result of classifyCells
 * @param {number} width
 * @param {number} height
 * @param {string[]} colors one #rrggbb per class
 * @returns {string}
 */
export function paintCells(classes, width, height, colors) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const rgb = colors.map(hexToRgb);
  for (let cell = 0; cell < classes.length; cell += 1) {
    const i = classes[cell];
    if (i < 0) continue;
    const offset = cell * 4;
    image.data[offset] = rgb[i][0];
    image.data[offset + 1] = rgb[i][1];
    image.data[offset + 2] = rgb[i][2];
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}
