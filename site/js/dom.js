/**
 * Small helpers for building page elements.
 */

/**
 * Create an element with an optional class and text.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Replace a select's options, keeping the current value when still offered.
 * @param {HTMLSelectElement} select
 * @param {{value: string, label: string}[]} options
 */
export function setOptions(select, options) {
  const previous = select.value;
  select.replaceChildren(...options.map(({ value, label }) => {
    const option = element("option", "", label);
    option.value = value;
    return option;
  }));
  if (options.some((o) => o.value === previous)) select.value = previous;
}
