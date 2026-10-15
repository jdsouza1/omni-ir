// npm run showcase:shots -- [--ios <dir>] [--android <dir>]
//
// The showcase page's screenshots (PLAN-SHOWCASE.md, decision 3), as WebP in site/landing/public/showcase/:
//   - web and chat: taken here in headless Chrome or Edge, from the hosted playground (npm run
//     playground:static), the element's page (npm run elements:build -- --site) and the MCP demo host
//     (npm run mcp:host): the playground's share links draw the shop's screens, the
//     playground and the plain-HTML example are shown as they are, and the host streams a screen into the
//     MCP view;
//   - iPhone and Android: converted from the light-mode screenshots the demo UI tests take, in the
//     `ios-review` and `android-review` artifacts of the iOS and Android demo workflows (unzip each and
//     pass its folder).
// Free and offline: no model is called and nothing is downloaded.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { SHOTS_DIR } from "./showcase";

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const SITE = resolve("dist/site");
const MCP_HOST = resolve("dist/mcp-host");
const OUT = resolve(SHOTS_DIR);
const PHONE_WIDTH = 720;
const WEB_WIDTH = 1200;
const QUALITY = 0.8;

/** The phone screenshots the page uses: our name, and the screen the demo UI tests named it after. */
const PHONE = [
  { name: "shop", screen: "product" },
  { name: "dashboard", screen: "sales-dashboard" },
];

// Only the parts of the site the shots need (the full site build checks the shots, so it comes after).
for (const [dir, what] of [[join(SITE, "playground"), "npm run playground:static"], [join(SITE, "elements"), "npm run elements:build -- --site"], [MCP_HOST, "npm run mcp:host"]] as const) {
  if (!existsSync(dir)) throw new Error(`showcase:shots: nothing at ${dir}; run ${what} first`);
}
mkdirSync(OUT, { recursive: true });

// The site under /omni-ir/ (as on GitHub Pages) and the MCP host under /mcp-host/.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  const [root, base] = url.startsWith("/mcp-host/") ? [MCP_HOST, "/mcp-host/"] : url.startsWith("/omni-ir/") ? [SITE, "/omni-ir/"] : [undefined, ""];
  if (!root) return res.writeHead(404).end();
  let file = join(root, url.slice(base.length));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise<void>((r) => http.listen(8792, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:8792";

// Headless Chrome or Edge over the DevTools protocol, as scripts/layout-check.mjs does: no new dependency.
const BROWSERS = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter((b): b is string => !!b);
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error("showcase:shots needs Chrome or Edge (set CHROME_PATH)");
const chrome = spawn(browser, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--force-color-profile=srgb",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "omni-shots-"))}`, "--remote-debugging-port=9335",
  ...(process.platform === "linux" ? ["--no-sandbox"] : []), "about:blank",
], { stdio: "ignore" });

let targets: { type: string; webSocketDebuggerUrl: string }[] | undefined;
for (let i = 0; i < 50 && !targets?.some((t) => t.type === "page"); i++) {
  await new Promise((r) => setTimeout(r, 200));
  targets = await fetch("http://127.0.0.1:9335/json/list").then((r) => r.json()).catch(() => undefined);
}
const target = targets?.find((t) => t.type === "page");
if (!target) throw new Error("showcase:shots: no browser page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let nextId = 1;
const pending = new Map<number, (m: any) => void>();
ws.onmessage = (msg) => {
  const m = JSON.parse(String(msg.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
};
const send = (method: string, params: object = {}) => new Promise<any>((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async <T>(expression: string): Promise<T> => {
  const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(`showcase:shots: ${m.result.exceptionDetails.exception?.description ?? "script failed"}`);
  return m.result?.result?.value as T;
};
/** Wait until a condition holds in the page; screenshots wait for what they show, never a fixed time. */
const waitFor = async (condition: string, what: string) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate<boolean>(`!!(${condition})`)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`showcase:shots: timed out waiting for ${what}`);
};
const settle = () => evaluate(`Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))])`);
await send("Page.enable");

/** The URL-safe base64 the playground's share links use (playground/ownAi.ts). */
const shareLink = (source: string) => `${ORIGIN}/omni-ir/playground/#screen=${Buffer.from(source, "utf8").toString("base64url")}`;
const fixture = (file: string) => readFileSync(resolve(file), "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n").trim();

async function shoot(name: string, url: string, opts: { ready: string; what: string; selector?: string; width: number; height: number; outWidth: number }) {
  await send("Emulation.setDeviceMetricsOverride", { width: opts.width, height: opts.height, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url });
  await waitFor(opts.ready, opts.what);
  await settle();
  // The playground scrolls its preview into view, smoothly: measure only once the page has stopped moving.
  await evaluate(`new Promise((done) => { let last = -1, still = 0; const tick = () => { still = scrollY === last ? still + 1 : 0; last = scrollY; still >= 20 ? done() : requestAnimationFrame(tick); }; tick(); })`);
  const box = opts.selector
    ? await evaluate<{ x: number; y: number; width: number; height: number }>(`(() => { const r = document.querySelector(${JSON.stringify(opts.selector)}).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`)
    : { x: 0, y: 0, width: opts.width, height: opts.height };
  const pad = 0;
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad, scale: opts.outWidth / (box.width + 2 * pad) / 2 };
  const { result } = await send("Page.captureScreenshot", { format: "webp", quality: Math.round(QUALITY * 100), clip, captureBeyondViewport: true });
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(result.data, "base64"));
  console.log(`wrote ${name}.webp`);
}

const DRAWN = `document.querySelector(".pg-preview-canvas .omni-root") && !document.querySelector(".pg-preview-canvas .omni-skeleton")`;
await shoot("shop-web", shareLink(fixture("fixtures/product.omni")), { ready: DRAWN, what: "the product screen", selector: ".pg-preview-canvas .omni-root", width: 1280, height: 1000, outWidth: 720 });
await shoot("dashboard-web", shareLink(fixture("fixtures/sales-dashboard.omni")), { ready: DRAWN, what: "the dashboard", selector: ".pg-preview-canvas .omni-root", width: 1280, height: 2600, outWidth: 720 });
await shoot("playground-web", shareLink(fixture("fixtures/landing/booking.omni")), { ready: DRAWN, what: "the playground", width: 1280, height: 1640, outWidth: WEB_WIDTH });
await shoot("elements-web", `${ORIGIN}/omni-ir/elements/`, { ready: `document.querySelector("omni-screen")?.shadowRoot?.querySelector("button")`, what: "the plain-HTML example", selector: "main", width: 760, height: 900, outWidth: 720 });
await shoot("chat-web", `${ORIGIN}/mcp-host/index.html?screen=booking`, { ready: `document.body.dataset.done === "true"`, what: "the MCP host's stream", width: 1000, height: 1000, outWidth: WEB_WIDTH });

/** The first PNG under a folder whose name starts with the screen's light-mode name. */
function findPng(dir: string, screen: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findPng(path, screen);
      if (found) return found;
    } else if (entry.name.startsWith(`${screen}-light`) && !entry.name.includes("large-text") && entry.name.endsWith(".png")) return path;
  }
  return undefined;
}

for (const [platform, dir] of [["ios", arg("--ios")], ["android", arg("--android")]] as const) {
  if (!dir) {
    console.log(`no --${platform} folder: kept the ${platform} screenshots as they are`);
    continue;
  }
  await send("Page.navigate", { url: "about:blank" });
  for (const { name, screen } of PHONE) {
    const png = findPng(resolve(dir), screen) ?? (() => { throw new Error(`showcase:shots: no ${screen}-light*.png under ${dir}`); })();
    const data = readFileSync(png).toString("base64");
    const webp = await evaluate<string>(`(async () => {
      const img = new Image();
      img.src = "data:image/png;base64,${data}";
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = ${PHONE_WIDTH};
      canvas.height = Math.round(img.naturalHeight * ${PHONE_WIDTH} / img.naturalWidth);
      const g = canvas.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/webp", ${QUALITY}).split(",")[1];
    })()`);
    writeFileSync(join(OUT, `${name}-${platform}.webp`), Buffer.from(webp, "base64"));
    console.log(`wrote ${name}-${platform}.webp from ${png}`);
  }
}

ws.close();
chrome.kill();
http.close();
