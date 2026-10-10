// Records the demo video's web scene (PLAN-VIDEO.md) with headless Chrome's own screencast, through the
// DevTools protocol: no new dependency. Needs the reference server on :8787 (free mock model) with
// OMNI_CORS_ORIGIN=http://localhost:8790, and packages/elements/dist/omni-elements.js built.
//
//   node scripts/video/record-web.mjs out/web     → out/web/frames/*.jpg, frames.ffconcat, meta.json
//
// Each frame keeps its wall-clock time, so the compose step lines it up with the server's log.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const out = resolve(process.argv[2] ?? "video-out/web");
const SECONDS = Number(process.env.WEB_SECONDS ?? 22);
const WIDTH = 600;
const HEIGHT = 1000;
const BROWSERS = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean);
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error("record-web needs Chrome or Edge (set CHROME_PATH)");

// The page and the element, served on :8790.
const site = join(out, "site");
mkdirSync(join(out, "frames"), { recursive: true });
mkdirSync(site, { recursive: true });
copyFileSync("scripts/video/web.html", join(site, "index.html"));
copyFileSync("packages/elements/dist/omni-elements.js", join(site, "omni-elements.js"));
const types = { ".html": "text/html", ".js": "text/javascript" };
const http = createServer((req, res) => {
  const name = req.url === "/" ? "index.html" : req.url.slice(1).split("?")[0];
  const file = join(site, name);
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[name.slice(name.lastIndexOf("."))] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise((r) => http.listen(8790, r));

const chrome = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  `--user-data-dir=${join(tmpdir(), "omni-video-profile")}`, `--window-size=${WIDTH},${HEIGHT}`,
  "--remote-debugging-port=9333", ...(process.platform === "linux" ? ["--no-sandbox"] : []), "about:blank",
], { stdio: "ignore" });

let targets;
for (let i = 0; i < 50 && !targets; i++) {
  await new Promise((r) => setTimeout(r, 200));
  targets = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json()).catch(() => undefined);
}
const page = targets?.find((t) => t.type === "page");
if (!page) throw new Error("record-web: no page target");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map();
const frames = [];
ws.onmessage = (msg) => {
  const m = JSON.parse(String(msg.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Page.screencastFrame") {
    const n = frames.length;
    writeFileSync(join(out, "frames", `${String(n).padStart(5, "0")}.jpg`), Buffer.from(m.params.data, "base64"));
    frames.push(m.params.metadata.timestamp);
    send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
  }
};
const send = (method, params = {}) => new Promise((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url: "http://localhost:8790/" });
await new Promise((r) => setTimeout(r, 1500));
await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: WIDTH * 2, maxHeight: HEIGHT * 2, everyNthFrame: 1 });
await new Promise((r) => setTimeout(r, 800));
const started = Date.now() / 1000;
await send("Runtime.evaluate", { expression: "window.startDemo()" });
await new Promise((r) => setTimeout(r, SECONDS * 1000));
await send("Page.stopScreencast");
ws.close();
chrome.kill();
http.close();

// The screencast sends a frame only when the page changes: each frame lasts until the next one.
const lines = ["ffconcat version 1.0"];
frames.forEach((t, i) => {
  lines.push(`file frames/${String(i).padStart(5, "0")}.jpg`);
  lines.push(`duration ${((frames[i + 1] ?? started + SECONDS) - t).toFixed(3)}`);
});
lines.push(`file frames/${String(frames.length - 1).padStart(5, "0")}.jpg`);
writeFileSync(join(out, "frames.ffconcat"), lines.join("\n") + "\n");
writeFileSync(join(out, "meta.json"), JSON.stringify({ t0: frames[0], started, frames: frames.length }, null, 1));
console.log(`record-web: ${frames.length} frames over ${SECONDS} s → ${out}`);
process.exit(0);
