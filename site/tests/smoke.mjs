/**
 * Browser smoke test: serves the site with the fixture outputs, opens it
 * in headless Chrome and checks the status board and both map paths.
 * Run: node tests/smoke.mjs (set CHROME to the browser binary if needed).
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = join(SITE, "tests", "fixtures");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".tif": "image/tiff" };
const TIMEOUT_MS = 30000;

/**
 * Serve site/ at / and the fixture tree at /outputs on a free port.
 * @returns {Promise<{server: import("node:http").Server, port: number}>}
 */
function serve() {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
    const file = path.startsWith("/outputs/") ? join(FIXTURES, path) : join(SITE, path === "/" ? "index.html" : path);
    try {
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

/**
 * Start headless Chrome and return it with its DevTools HTTP address.
 * @returns {Promise<{chrome: import("node:child_process").ChildProcess, devtools: string}>}
 */
function launchChrome() {
  const binary = process.env.CHROME || "google-chrome";
  const chrome = spawn(binary, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "about:blank"]);
  return new Promise((resolve, reject) => {
    chrome.on("error", reject);
    chrome.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on ws:\/\/([^/]+)\//);
      if (match) resolve({ chrome, devtools: `http://${match[1]}` });
    });
  });
}

/**
 * Open a page and return a helper that evaluates expressions in it.
 * @param {string} devtools DevTools HTTP address
 * @param {string} url page to open
 * @returns {Promise<{evaluate: (expression: string) => Promise<any>, close: () => void}>}
 */
async function openPage(devtools, url) {
  const target = await (await fetch(`${devtools}/json/new?${url}`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  });
  const evaluate = (expression) => new Promise((resolve) => {
    pending.set(++id, (result) => resolve(result?.result?.value));
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
  return { evaluate, close: () => socket.close() };
}

/**
 * Poll an expression until it returns a truthy value or time runs out.
 * @param {(expression: string) => Promise<any>} evaluate
 * @param {string} expression
 * @param {string} what description for the failure message
 * @returns {Promise<any>}
 */
async function waitFor(evaluate, expression, what) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${what}; info line: ${await evaluate('document.getElementById("info").textContent')}`);
}

/**
 * Run the checks against the served page.
 * @param {(expression: string) => Promise<any>} evaluate
 */
async function check(evaluate) {
  const card = await waitFor(evaluate, 'document.querySelector("#status .card")?.textContent', "status cards");
  if (!card.includes("1 of 1 flood sites triggered")) throw new Error(`Guatemala card: ${card}`);
  await waitFor(evaluate, 'document.getElementById("info").textContent.includes("qpeaccum") && document.getElementById("info").textContent.includes(" 7 cells shown")', "rainfall map with 7 cells");
  await evaluate('(() => { const f = document.getElementById("controls"); f.product.value = "flood"; f.product.dispatchEvent(new Event("change", { bubbles: true })); })()');
  await waitFor(evaluate, 'document.getElementById("info").textContent.includes("prob_depth_ge_10cm") && document.getElementById("info").textContent.includes(" 5 cells shown")', "flood map with 5 cells");
}

const { server, port } = await serve();
const { chrome, devtools } = await launchChrome();
let failed = false;
try {
  const page = await openPage(devtools, `http://127.0.0.1:${port}/`);
  await check(page.evaluate);
  page.close();
  console.log("site smoke test ok: status board, rainfall and flood maps");
} catch (error) {
  failed = true;
  console.error(`site smoke test failed: ${error.message}`);
} finally {
  chrome.kill();
  server.close();
}
process.exit(failed ? 1 : 0);
