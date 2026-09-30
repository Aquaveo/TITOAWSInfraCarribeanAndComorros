/**
 * The Leaflet map: basemap, one product overlay at a time, and its legend.
 * Uses the Leaflet global (L) loaded by index.html.
 */

import { element } from "./dom.js";

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** A web map that shows one coloured raster and its legend. */
export class ViewerMap {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.map = L.map(container, { zoomSnap: 0.5 }).setView([15, -75], 4);
    L.tileLayer(OSM_TILES, { maxZoom: 18, attribution: OSM_CREDIT }).addTo(this.map);
    this.overlay = null;
    this.features = null;
    this.legend = L.control({ position: "bottomleft" });
    this.legend.onAdd = () => element("div", "legend");
    this.legend.addTo(this.map);
  }

  /**
   * Replace the overlay with a new image.
   * @param {string} imageUrl
   * @param {number[][]} bounds [[south, west], [north, east]]
   * @param {boolean} fit zoom to the image
   */
  show(imageUrl, bounds, fit) {
    this.clear();
    this.overlay = L.imageOverlay(imageUrl, bounds, { opacity: 0.85, className: "raster" }).addTo(this.map);
    if (fit) this.map.fitBounds(bounds, { padding: [16, 16] });
  }

  /** Remove the overlay, if any. */
  clear() {
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
  }

  /**
   * Replace the vector layer with GeoJSON features coloured by their
   * risk_color property, each with a popup.
   * @param {object} geojson FeatureCollection in WGS84
   * @param {(properties: object) => HTMLElement} popup
   * @param {boolean} fit zoom to the features
   */
  showFeatures(geojson, popup, fit) {
    this.clearFeatures();
    this.features = L.geoJSON(geojson, {
      style: (feature) => {
        const color = feature.properties.risk_color || "#555555";
        return { color, weight: 2, fillColor: color, fillOpacity: 0.3 };
      },
      onEachFeature: (feature, layer) => layer.bindPopup(() => popup(feature.properties)),
    }).addTo(this.map);
    if (fit) this.map.fitBounds(this.features.getBounds(), { padding: [16, 16] });
  }

  /** Remove the vector layer, if any. */
  clearFeatures() {
    if (this.features) this.features.remove();
    this.features = null;
  }

  /**
   * Draw the legend for a product, or hide it.
   * @param {{title: string, unit: string, colors: string[], labels: string[]}|null} legend
   * @param {string} [note] line under the title, e.g. the statistic shown
   */
  setLegend(legend, note) {
    const box = this.legend.getContainer();
    box.replaceChildren();
    box.hidden = !legend;
    if (!legend) return;
    box.append(element("strong", "", `${legend.title} (${legend.unit})`));
    if (note) box.append(element("div", "note", note));
    legend.colors.forEach((color, i) => {
      const row = element("div", "row");
      const swatch = element("span", "swatch");
      swatch.style.background = color;
      row.append(swatch, element("span", "", legend.labels[i]));
      box.append(row);
    });
  }
}
