/**
 * The file browser: a folder tree of one cycle's files, built from its
 * index.json, with a download link and a copy-URL button per file.
 */

import { copyButton, element } from "./dom.js";

const UNITS = ["B", "KB", "MB", "GB"];

/**
 * Group a flat file list into nested folders with counts and sizes.
 * @param {{path: string, size: number}[]} files
 * @returns {{folders: Map<string, object>, files: object[], count: number, size: number}}
 */
export function buildTree(files) {
  const root = emptyFolder();
  for (const file of files) {
    const parts = file.path.split("/");
    const name = parts.pop();
    let folder = root;
    folder.count += 1;
    folder.size += file.size;
    for (const part of parts) {
      if (!folder.folders.has(part)) folder.folders.set(part, emptyFolder());
      folder = folder.folders.get(part);
      folder.count += 1;
      folder.size += file.size;
    }
    folder.files.push({ ...file, name });
  }
  sortFolder(root);
  return root;
}

/**
 * A folder with nothing in it yet.
 * @returns {{folders: Map<string, object>, files: object[], count: number, size: number}}
 */
function emptyFolder() {
  return { folders: new Map(), files: [], count: 0, size: 0 };
}

/**
 * Sort a folder's subfolders and files by name, all the way down.
 * @param {{folders: Map<string, object>, files: object[]}} folder
 */
function sortFolder(folder) {
  folder.files.sort((a, b) => a.name.localeCompare(b.name));
  folder.folders = new Map([...folder.folders].sort(([a], [b]) => a.localeCompare(b)));
  for (const child of folder.folders.values()) sortFolder(child);
}

/**
 * Files whose path contains the text, ignoring case. Blank keeps all.
 * @param {{path: string}[]} files
 * @param {string} text
 * @returns {{path: string}[]}
 */
export function filterFiles(files, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return files;
  return files.filter((file) => file.path.toLowerCase().includes(needle));
}

/**
 * A byte count in the largest fitting unit, e.g. 117 KB or 3.2 GB.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/**
 * The element for a folder's contents. Subfolders render their own
 * contents only when first opened, so large cycles stay fast.
 * @param {{folders: Map<string, object>, files: object[]}} folder
 * @param {string} base URL of this folder
 * @param {boolean} [expand] open every folder now, e.g. for filter results
 * @returns {HTMLElement}
 */
export function folderElement(folder, base, expand = false) {
  const list = element("ul", "tree");
  for (const [name, child] of folder.folders) {
    const item = element("li");
    const details = element("details");
    const summary = element("summary");
    summary.append(
      element("span", "name", `${name}/`),
      element("span", "meta", `${child.count.toLocaleString("en")} files, ${formatBytes(child.size)}`),
    );
    details.append(summary);
    if (expand) {
      details.open = true;
      details.append(folderElement(child, `${base}/${name}`, true));
    }
    details.addEventListener("toggle", () => {
      if (details.open && details.childElementCount === 1) details.append(folderElement(child, `${base}/${name}`));
    });
    item.append(details);
    list.append(item);
  }
  for (const file of folder.files) list.append(fileElement(file, `${base}/${file.name}`));
  return list;
}

/**
 * One file row: name, size, download link and copy-URL button.
 * @param {{name: string, size: number}} file
 * @param {string} url public URL of the file
 * @returns {HTMLElement}
 */
function fileElement(file, url) {
  const item = element("li", "file");
  const open = element("a", "action", "open");
  open.href = url;
  item.append(element("span", "name", file.name), element("span", "meta", formatBytes(file.size)), open, copyButton(url));
  return item;
}
