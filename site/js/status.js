/**
 * The status board: one card per country showing how fresh its latest
 * cycle is and whether any flood site triggered.
 */

import { AGE_LIMITS } from "./config.js";
import { element } from "./dom.js";
import { cycleTime, fetchJson, loadCycle, siteSummaryPaths } from "./outputs.js";

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

/**
 * Gather one country's status from its latest cycle.
 * Never throws: a failure is returned as the error field.
 * @param {string} base
 * @param {{key: string, name: string}} country
 * @returns {Promise<object>}
 */
export async function loadStatus(base, country) {
  try {
    const { latest, paths, root } = await loadCycle(base, country.key);
    const summaries = await Promise.all(
      siteSummaryPaths(paths).map((path) => fetchJson(`${root}/${path}`)),
    );
    return {
      ...country,
      cycle: latest.cycle,
      published: new Date(latest.published_utc),
      files: paths.length,
      sites: summaries.length,
      triggered: summaries.filter((s) => s.trigger && s.trigger.triggered).length,
    };
  } catch (error) {
    return { ...country, error: error.message };
  }
}

/**
 * Whole minutes between publication and now.
 * @param {Date} published
 * @param {Date} now
 * @returns {number}
 */
export function ageMinutes(published, now) {
  return Math.floor((now - published) / 60000);
}

/**
 * Health level for an age: ok, late or stale.
 * @param {number} minutes
 * @returns {"ok"|"late"|"stale"}
 */
export function ageLevel(minutes) {
  if (minutes < AGE_LIMITS.lateMinutes) return "ok";
  if (minutes < AGE_LIMITS.staleMinutes) return "late";
  return "stale";
}

/**
 * Short human age such as "12 min ago" or "3 h 5 min ago".
 * @param {number} minutes
 * @returns {string}
 */
export function ageText(minutes) {
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

/**
 * Build the card element for one country's status.
 * @param {object} status result of loadStatus
 * @param {Date} now
 * @returns {HTMLElement}
 */
export function statusCard(status, now) {
  const card = element("article", "card");
  card.append(element("h3", "", status.name));
  if (status.error) {
    card.classList.add("stale");
    card.append(element("p", "age", "No outputs found"), element("p", "detail", status.error));
    return card;
  }
  const minutes = ageMinutes(status.published, now);
  card.classList.add(ageLevel(minutes));
  const floods = status.sites
    ? `${status.triggered} of ${status.sites} flood sites triggered`
    : "No flood sites";
  card.append(
    element("p", "age", `Published ${ageText(minutes)}`),
    element("p", "detail", `Cycle ${TIME_FORMAT.format(cycleTime(status.cycle))} UTC`),
    element("p", "detail", `${status.files.toLocaleString("en")} files`),
    element("p", status.triggered ? "detail alert" : "detail", floods),
  );
  return card;
}
