// npm run examples:test [-- html vue svelte angular] [--screenshots dir]: proves <omni-screen> works in
// each framework (Step 21, PLAN-ELEMENTS.md decision 7). For each example in examples/, it copies the
// project to a temporary folder, installs the packed @omni-ir/elements (run npm run build:packages
// first) and the example's pinned packages from npm, builds it, serves the build, and opens it in
// headless Chrome or Edge with ?check: the page draws a screen, presses its governed button and
// writes what happened into <pre id="omni-check">, which this script reads back. Free: no model, no
// paid service; it downloads free packages from npm.
import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--screenshots");
const shots = shotsAt === -1 ? null : resolve(args[shotsAt + 1] ?? "review/examples");
const names = args.filter((a, i) => !a.startsWith("--") && i !== shotsAt + 1);
const EXAMPLES = names.length > 0 ? names : ["html", "vue", "svelte", "angular"];
const keep = process.env.KEEP_EXAMPLES === "1";

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error("examples:test needs Chrome or Edge (set CHROME_PATH)");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

/** Serves a built example from `root` on a free port. */
function serve(root) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** The browser, run without blocking: the page's files come from a server in this same process. */
const browse = (args) => promisify(execFile)(browser, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 90_000 });

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, NG_CLI_ANALYTICS: "false", CI: "true" } });

const work = mkdtempSync(join(tmpdir(), "omni-examples-"));
const failures = [];
try {
  const [{ filename }] = JSON.parse(execSync(`npm pack --json --workspace packages/elements --pack-destination "${work}"`, { encoding: "utf8" }));
  const tarball = join(work, filename);

  for (const name of EXAMPLES) {
    console.log(`\n=== ${name}`);
    const dir = join(work, name);
    cpSync(resolve("examples", name), dir, { recursive: true, filter: (src) => !/node_modules|[\\/]dist[\\/]?/.test(src.slice(resolve("examples", name).length)) });
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    manifest.dependencies["@omni-ir/elements"] = `file:${tarball}`;
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
    run("npm install --no-audit --no-fund --loglevel=error", dir);
    run("npm run build", dir);

    const built = existsSync(join(dir, "dist", "browser")) ? join(dir, "dist", "browser") : join(dir, "dist");
    const server = await serve(built);
    const url = `http://127.0.0.1:${server.address().port}/?check`;
    // Its own profile: with the default one, a headless Edge or Chrome joins a browser already open
    // on this machine and never returns.
    const profile = ["--headless", "--disable-gpu", "--disable-extensions", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(work, `profile-${name}`)}`, "--virtual-time-budget=10000"];
    // Ubuntu 24.04 CI runners don't allow Chrome's sandbox; it's only ever our own example page.
    if (process.platform === "linux" && process.env.CI) profile.push("--no-sandbox");
    try {
      const { stdout: dom } = await browse([...profile, "--dump-dom", url]);
      const raw = /<pre id="omni-check"[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1] ?? "";
      const text = raw.replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
      const check = text ? JSON.parse(text) : null;
      const ok = check !== null && check.drawn === true && check.sent?.includes("payments.confirm") && (check.appComponent === undefined || check.appComponent === true);
      console.log(`${name}: ${ok ? "ok" : "FAILED"} ${text || "(the page wrote no check)"}`);
      if (!ok) failures.push(name);
      if (shots) {
        mkdirSync(shots, { recursive: true });
        const out = join(shots, `${name}.png`);
        await browse([...profile, "--hide-scrollbars", "--window-size=720,760", `--screenshot=${out}`, url.replace("?check", "")]);
        console.log(`screenshot: ${out}`);
      }
    } finally {
      server.close();
    }
  }
} finally {
  if (keep) console.log(`kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nexamples:test failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nexamples:test: ok (${EXAMPLES.join(", ")})`);
