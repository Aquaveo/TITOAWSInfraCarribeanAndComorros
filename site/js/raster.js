/**
 * Loading TITO GeoTIFFs in the browser and placing them on a web map.
 * Uses the geotiff.js global (GeoTIFF) loaded by index.html.
 */

const EARTH_RADIUS_M = 6378137;
const DEGREES = 180 / Math.PI;

/**
 * Download and decode the first band of a GeoTIFF.
 * @param {string} url
 * @returns {Promise<{values: ArrayLike<number>, width: number, height: number,
 *   bbox: number[], epsg: number, nodata: number|null}>}
 */
export async function loadRaster(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const tiff = await globalThis.GeoTIFF.fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  const [values] = await image.readRasters();
  const keys = image.getGeoKeys();
  return {
    values,
    width: image.getWidth(),
    height: image.getHeight(),
    bbox: image.getBoundingBox(),
    epsg: keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey,
    nodata: image.getGDALNoData(),
  };
}

/**
 * Corner coordinates of a raster as Leaflet [[south, west], [north, east]].
 * Supports the two CRSs TITO writes: EPSG:4326 and EPSG:3857.
 * @param {number[]} bbox [minX, minY, maxX, maxY] in the raster CRS
 * @param {number} epsg
 * @returns {number[][]}
 */
export function rasterBounds([minX, minY, maxX, maxY], epsg) {
  if (epsg === 4326) return [[minY, minX], [maxY, maxX]];
  if (epsg === 3857) {
    const [south, west] = mercatorToLatLng(minX, minY);
    const [north, east] = mercatorToLatLng(maxX, maxY);
    return [[south, west], [north, east]];
  }
  throw new Error(`unsupported CRS EPSG:${epsg}`);
}

/**
 * Convert Web Mercator metres to [latitude, longitude] in degrees.
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
export function mercatorToLatLng(x, y) {
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * DEGREES;
  return [lat, (x / EARTH_RADIUS_M) * DEGREES];
}
