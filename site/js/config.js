/**
 * Fixed settings for the TITO outputs viewer: countries, age thresholds
 * and the legend classes used by the forecast app.
 */

/** Countries in display order, keyed by their outputs/ folder. */
export const COUNTRIES = [
  { key: "guatemala", name: "Guatemala" },
  { key: "haiti", name: "Haiti" },
  { key: "barbados", name: "Barbados" },
  { key: "antigua", name: "Antigua and Barbuda" },
  { key: "comoros", name: "Comoros" },
];

/** Minutes since publication before a country is late, then stale. */
export const AGE_LIMITS = { lateMinutes: 90, staleMinutes: 150 };

/**
 * Legend classes per product. A value v falls in class i when
 * breaks[i] <= v < breaks[i + 1]; values below breaks[0] are not drawn.
 * Labels match the forecast app's legends.
 */
export const LEGENDS = {
  qpeaccum: {
    title: "Rainfall accumulation",
    unit: "mm",
    breaks: [1, 5, 10, 25, 50, 75, 100, 150, 250, Infinity],
    colors: ["#d9f0a3", "#addd8e", "#41ab5d", "#ffffb2", "#fdae61", "#f46d43", "#d73027", "#a50026", "#6a3d9a"],
    labels: ["1 to 5", "5 to 10", "10 to 25", "25 to 50", "50 to 75", "75 to 100", "100 to 150", "150 to 250", "250 and more"],
  },
  maxunitq: {
    title: "Max unit streamflow",
    unit: "m³/s per km²",
    breaks: [0.1, 1, 2, 4, 6, 10, 20, Infinity],
    colors: ["#bdbdbd", "#d9ef8b", "#fdae61", "#d73027", "#c51b7d", "#2c7bb6", "#08306b"],
    labels: ["0.1 to 1", "1 to 2", "2 to 4", "4 to 6", "6 to 10", "10 to 20", "20 and more"],
  },
  maxsm: {
    title: "Soil saturation",
    unit: "%",
    breaks: [10, 30, 50, 70, 85, 95, 100.1],
    colors: ["#f6e8c3", "#dfc27d", "#80cdc1", "#35978f", "#01665e", "#003c30"],
    labels: ["10 to 30", "30 to 50", "50 to 70", "70 to 85", "85 to 95", "95 to 100"],
  },
  flood: {
    title: "Flood probability",
    unit: "% of members",
    breaks: [0.05, 0.2, 0.5, 0.8, 1.01],
    colors: ["#c6dbef", "#6baed6", "#3f51d8", "#5b00b3"],
    labels: ["5 to 20", "20 to 50", "50 to 80", "80 to 100"],
  },
};

/** Depth thresholds, in cm, of the flood probability rasters. */
export const FLOOD_DEPTHS_CM = [10, 30, 70, 100];
