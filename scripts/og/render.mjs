// node scripts/og/render.mjs: renders scripts/og/card.html to site/landing/public/og.png (1200x630),
// the image shown when a link to the site is shared. Uses headless Microsoft Edge or Chrome, whichever
// is installed; the image is committed, so the site build doesn't need a browser.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const browsers = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const browser = browsers.find((b) => existsSync(b));
if (!browser) throw new Error("No Edge or Chrome found to render the preview image.");
const out = resolve("site/landing/public/og.png");
execFileSync(browser, ["--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,630", "--virtual-time-budget=5000", `--screenshot=${out}`, pathToFileURL(resolve("scripts/og/card.html")).href], { stdio: "inherit" });
console.log(`wrote ${out}`);
