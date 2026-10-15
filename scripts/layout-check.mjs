// npm run layout:check — the built site's pages at phone, tablet and desktop widths, in headless
// Chrome or Edge: fails if anything sticks out of its card or out of the screen. Run after
// `npm run site:build`; the Site workflow runs it before deploying. Free, offline, no new dependency.
//
// Added after the comparison page's cards overflowed on the owner's Pixel (2026-10-11), which a check
// for sideways scrolling alone didn't catch.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const SITE = resolve(process.argv[2] ?? "dist/site");
const BASE = "/omni-ir/";
const WIDTHS = [360, 412, 768, 1280];
const PAGES = [
  { name: "landing page", path: "" },
  { name: "comparison page", path: "compare/", act: "compare" },
  { name: "showcase", path: "showcase/", act: "showcase" },
];
// Boxes whose contents must stay inside them.
const BOXES = [".tile", ".plan", ".principles", ".cmp-card", ".cmp-row", ".cmp-format", ".cmp-picker", ".cmp-answer details", ".demo-video", ".sc-app", ".sc-uses > div", ".sc-stream"];

const BROWSERS = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error("layout:check needs Chrome or Edge (set CHROME_PATH)");
if (!existsSync(join(SITE, "compare/index.html"))) throw new Error(`layout:check: build the site first (npm run site:build); nothing at ${SITE}`);

// The site, served under /omni-ir/ as on GitHub Pages.
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".woff2": "font/woff2" };
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (!url.startsWith(BASE)) return res.writeHead(404).end();
  let file = join(SITE, url.slice(BASE.length));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => http.listen(8791, "127.0.0.1", r));

const chrome = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "omni-layout-"))}`, "--remote-debugging-port=9334",
  ...(process.platform === "linux" ? ["--no-sandbox"] : []), "about:blank",
], { stdio: "ignore" });

let targets;
for (let i = 0; i < 50 && !targets?.some((t) => t.type === "page"); i++) {
  await new Promise((r) => setTimeout(r, 200));
  targets = await fetch("http://127.0.0.1:9334/json/list").then((r) => r.json()).catch(() => undefined);
}
const page = targets?.find((t) => t.type === "page");
if (!page) throw new Error("layout:check: no browser page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map();
const loaded = [];
ws.onmessage = (msg) => {
  const m = JSON.parse(String(msg.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Page.loadEventFired") loaded.splice(0).forEach((r) => r());
};
const send = (method, params = {}) => new Promise((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(`layout:check: ${m.result.exceptionDetails.exception?.description ?? "script failed"}`);
  return m.result?.result?.value;
};

// What a visitor does on the page before it's measured, so the busiest state is checked.
const ACT = {
  compare: `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const picker = document.querySelector(".cmp-picker select");
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    set.call(picker, "assistant"); picker.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(200);
    document.querySelector(".cmp-chip")?.click();
    document.querySelector(".cmp-race-head button")?.click();
    document.querySelectorAll(".cmp-answer details").forEach((d) => (d.open = true));
    await wait(1500);
  })()`,
  // Open every app's stream, so the drawn screens and code are measured too.
  showcase: `(async () => {
    document.querySelectorAll(".sc-actions button").forEach((b) => b.click());
    await new Promise((r) => setTimeout(r, 500));
  })()`,
};

// Anything wider than the screen, or sticking out of its box, unless it's inside something that scrolls.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const scrolls = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== "visible" && a !== document.body && a !== document.documentElement) return true; } return false; };
  const label = (el) => el.tagName.toLowerCase() + (el.classList.length ? "." + [...el.classList].join(".") : "");
  const problems = [];
  if (document.documentElement.scrollWidth > vw + 1) problems.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " px wide)");
  for (const box of document.querySelectorAll(${JSON.stringify(BOXES.join(", "))})) {
    const b = box.getBoundingClientRect();
    if (b.width === 0) continue;
    if (b.right > vw + 1) { problems.push(label(box) + " runs " + Math.round(b.right - vw) + " px off the screen"); continue; }
    for (const el of box.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || scrolls(el) && el.closest("pre, .cmp-drawn")) continue;
      if (r.right > b.right + 1) { problems.push(label(el) + " sticks out of " + label(box) + " by " + Math.round(r.right - b.right) + " px"); break; }
    }
  }
  return [...new Set(problems)];
})()`;

await send("Page.enable");
await send("Runtime.enable");
let failed = 0;
for (const { name, path, act } of PAGES) {
  for (const width of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 768 });
    const ready = new Promise((r) => loaded.push(r));
    await send("Page.navigate", { url: `http://127.0.0.1:8791${BASE}${path}` });
    await ready;
    await new Promise((r) => setTimeout(r, 600));
    if (act) await evaluate(ACT[act]);
    const problems = await evaluate(MEASURE);
    if (problems.length) {
      failed++;
      console.error(`✗ ${name} at ${width} px:\n  ${problems.slice(0, 10).join("\n  ")}`);
    } else console.log(`✓ ${name} at ${width} px`);
  }
}
ws.close();
chrome.kill();
http.close();
if (failed) {
  console.error(`\nlayout:check: ${failed} page and width combinations have content outside its box.`);
  process.exit(1);
}
console.log("\nlayout:check: everything fits.");
process.exit(0);
