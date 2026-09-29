/**
 * The data access box: how to build public output URLs, filled in for
 * the selected country and its newest cycle.
 */

import { COUNTRIES } from "./config.js";
import { copyButton, element } from "./dom.js";

const NOTEBOOK = "https://colab.research.google.com/github/Aquaveo/TITOAWSInfraCarribeanAndComorros/blob/main/notebooks/tito_outputs.ipynb";

/**
 * The public URLs for a country's newest cycle.
 * @param {string} base outputs base URL, e.g. https://tito.uffis.org/outputs
 * @param {string} country
 * @param {string} cycle folder name such as 20260929.220000
 * @returns {{base: string, latest: string, index: string, file: string}}
 */
export function accessUrls(base, country, cycle) {
  return {
    base,
    latest: `${base}/${country}/latest.json`,
    index: `${base}/${country}/${cycle}/index.json`,
    file: `${base}/${country}/${cycle}/<path from index.json>`,
  };
}

/**
 * Code that fetches a country's newest cycle, for copying.
 * @param {string} base
 * @param {string} country
 * @returns {string}
 */
export function accessSnippet(base, country) {
  return [
    "import requests",
    `BASE = "${base}"`,
    `latest = requests.get(f"{BASE}/${country}/latest.json").json()`,
    `files = requests.get(f"{BASE}/${country}/{latest['cycle']}/index.json").json()["files"]`,
  ].join("\n");
}

/**
 * The data access box element.
 * @param {{base: string, latest: string, index: string, file: string}} urls
 * @param {string} country
 * @returns {HTMLElement}
 */
export function accessElement(urls, country) {
  const box = element("div", "access");
  const rows = element("dl");
  rows.append(
    ...urlRow("Base URL", urls.base, false),
    ...urlRow("Newest cycle", urls.latest, true),
    ...urlRow("File list", urls.index, true),
    ...urlRow("File URL", urls.file, false),
  );
  const notes = element("p", "detail",
    `Countries: ${COUNTRIES.map((c) => c.key).join(", ")}. Kept about one day. Public, CORS enabled, no key needed.`);
  const code = element("pre");
  code.append(element("code", "", accessSnippet(urls.base, country)));
  const notebook = element("a", "", "Open the checking notebook in Colab");
  notebook.href = NOTEBOOK;
  box.append(rows, notes, code, notebook);
  return box;
}

/**
 * A term and its URL, with open and copy actions when it is a real URL.
 * @param {string} label
 * @param {string} url
 * @param {boolean} openable
 * @returns {HTMLElement[]}
 */
function urlRow(label, url, openable) {
  const value = element("dd");
  value.append(element("code", "", url));
  if (openable) {
    const open = element("a", "action", "open");
    open.href = url;
    value.append(open);
  }
  if (!url.includes("<")) value.append(copyButton(url));
  return [element("dt", "", label), value];
}
