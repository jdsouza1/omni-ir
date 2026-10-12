// npm run preview -- <out-dir>   a phone-friendly preview of the built site, for the owner to review
// visual changes on a phone before a merge (the owner's rule, 2026-10-11). Run after
// `npm run site:build`. Writes <out-dir>/index.html (a launcher naming the branch and commit) and
// <out-dir>/site/ (the landing page, comparison page, playground and <omni-screen> page, without the
// docs), plus <out-dir>/files.json: the files to publish as one private claude.ai artifact, which the
// owner opens in the Claude app. Nothing here is published by the script itself.
//
// An artifact serves exact file paths only, so links to a folder ("compare/") point at its
// index.html in the copy; links to the docs point at the live site.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SITE = resolve("dist/site");
const OUT = resolve(process.argv[2] ?? "dist/preview");
const LIVE_DOCS = "https://jdsouza1.github.io/omni-ir/docs/";
if (!existsSync(join(SITE, "compare/index.html"))) throw new Error("preview: build the site first (npm run site:build)");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "site"), { recursive: true });
for (const name of readdirSync(SITE)) if (name !== "docs") cpSync(join(SITE, name), join(OUT, "site", name), { recursive: true });

const files = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const Q = "([`\"'])";
const RULES = [
  // "./" and "../" (home), and folders, to their index.html, keeping a #section.
  [new RegExp(`${Q}((?:\\.\\.?/)+)\\1`, "g"), "$1$2index.html$1"],
  [new RegExp(`${Q}((?:\\.\\./)*(?:compare|playground|elements)/)(#[\\w-]+)?\\1`, "g"), "$1$2index.html$3$1"],
  // The docs aren't in the preview: the live ones.
  [new RegExp(`${Q}(?:\\.\\./)*docs/([^\`"']*)\\1`, "g"), `$1${LIVE_DOCS}$2$1`],
];
let changed = 0;
for (const file of files(join(OUT, "site"))) {
  if (![".js", ".html"].includes(extname(file))) continue;
  const before = readFileSync(file, "utf8");
  let text = before;
  for (const [re, to] of RULES) text = text.replace(re, to);
  if (text !== before) {
    writeFileSync(file, text);
    changed++;
  }
}

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const branch = git("rev-parse --abbrev-ref HEAD");
const commit = git("rev-parse --short HEAD");
const subject = git("log -1 --format=%s");
const when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const PAGES = [
  ["Landing page", "site/index.html", "What a visitor sees first."],
  ["Get started", "site/playground/index.html#own-ai", "The no-code path: use your own AI."],
  ["Comparison", "site/compare/index.html", "How Omni-IR compares, in plain words."],
  ["Playground", "site/playground/index.html", "Describe a screen or paste Omni-IR."],
];

writeFileSync(
  join(OUT, "index.html"),
  `<title>Omni-IR Preview</title>
<style>
  /* A launcher: which build this is, and a big tap target per page. Light and dark. */
  :root { --bg: #f6f7fb; --card: #ffffff; --ink: #0f172a; --muted: #5b6478; --line: #e1e5ef; --brand: #4f46e5; --brand-soft: #eef0ff; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d1220; --card: #151c2e; --ink: #e8ebf3; --muted: #9aa3b8; --line: #263049; --brand: #8f8cff; --brand-soft: #1d2140; color-scheme: dark; } }
  :root[data-theme="dark"] { --bg: #0d1220; --card: #151c2e; --ink: #e8ebf3; --muted: #9aa3b8; --line: #263049; --brand: #8f8cff; --brand-soft: #1d2140; color-scheme: dark; }
  body { background: var(--bg); color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px 16px; }
  main { max-width: 560px; margin: 0 auto; display: grid; gap: 16px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; text-wrap: balance; }
  .build { margin: 0; padding: 14px 16px; border-radius: 14px; background: var(--brand-soft); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
  .build code { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; font-size: 13px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  a.page { display: grid; gap: 2px; padding: 16px 18px; border-radius: 16px; background: var(--card); border: 2px solid var(--line); color: var(--ink); text-decoration: none; }
  a.page:hover, a.page:focus-visible { border-color: var(--brand); outline: none; }
  a.page strong { font-size: 18px; color: var(--brand); }
  a.page span { color: var(--muted); font-size: 15px; }
  .note { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700&family=JetBrains+Mono&display=swap" />
<main>
  <h1>Omni-IR preview</h1>
  <p class="build">Branch <code>${esc(branch)}</code> at <code>${esc(commit)}</code>: ${esc(subject)}<br />Built ${when}. Not live: this is for review before merging.</p>
  <ul>
${PAGES.map(([name, href, what]) => `    <li><a class="page" href="${href}"><strong>${name}</strong><span>${what}</span></a></li>`).join("\n")}
  </ul>
  <p class="note">The docs aren't in the preview; their links open the live docs. Use your browser's back button to return here.</p>
</main>
`,
);

const published = files(join(OUT, "site")).map((f) => relative(OUT, f).replace(/\\/g, "/"));
writeFileSync(join(OUT, "files.json"), JSON.stringify(Object.fromEntries(published.map((p) => [p, join(OUT, p)])), null, 1));
console.log(`preview: ${branch} ${commit}, ${published.length} files (${changed} with links adjusted) in ${relative(process.cwd(), OUT) || OUT}`);
