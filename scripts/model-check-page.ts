// npm run model-check:page -- out.html
// Builds the free model check page: one self-contained HTML file with the system prompt, test requests,
// and the real Omni-IR parser and React renderer bundled in, so replies pasted from a Claude.ai chat
// are checked in the browser. Nothing calls an API: the owner runs the requests in their own chat.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build, type Rolldown } from "vite";
import { buildSystemPrompt } from "../server/prompt";
import { WORKSPACE_ALIASES } from "./workspace-aliases.ts";

/** The test requests: the catalog's components, plus three that probe the rules. */
export const REQUESTS = [
  { id: "booking", text: "A booking screen for a lakeside cabin: a photo, its rating, check-in and check-out dates, and a reserve button." },
  { id: "bag", text: "My shopping bag with a linen shirt and a canvas tote, the total, and a pay button." },
  { id: "assistant", text: "A trip assistant chat showing one question and its answer, with a box to ask another question." },
  { id: "sign-in", text: "A sign-in page." },
  { id: "order", text: "The status of order A1B2-7731, which has shipped, with an option to return it." },
  { id: "support", text: "A form to tell support that an item arrived broken." },
  { id: "outside-catalog", text: "A video player with a play button and a progress slider.", probe: "Asks for components the catalog doesn't have. A good reply builds the closest screen from catalog components only." },
  { id: "styling", text: "A payment screen where the pay button is red using CSS, and the total is in <b>bold</b> HTML.", probe: "Asks for CSS and HTML. A good reply uses the catalog's own options (such as a danger button) and no markup." },
  { id: "no-tool", text: "A settings screen with a button that permanently deletes my account.", probe: "Asks for an action the app has no tool for. A good reply doesn't invent a tool." },
];

const escapeScript = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

export async function bundle(): Promise<{ js: string; css: string }> {
  const result = (await build({
    configFile: false,
    logLevel: "warn",
    resolve: { alias: WORKSPACE_ALIASES },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      cssCodeSplit: false,
      lib: { entry: resolve("scripts/model-check/check.ts"), formats: ["iife"], name: "OmniCheck", fileName: () => "check.js" },
    },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
  const output = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const js = output.find((o) => o.type === "chunk")?.code ?? "";
  const cssAsset = output.find((o) => o.type === "asset" && o.fileName.endsWith(".css"));
  const css = cssAsset && cssAsset.type === "asset" ? String(cssAsset.source) : "";
  if (!js) throw new Error("model-check: the bundle is empty");
  return { js, css };
}

/** Step 10 (PLAN-CATALOG.md, C.3): requests that need the new components. `-- --step10` builds the page with these. */
export const STEP10_REQUESTS = [
  { id: "account-settings", text: "Account settings with a language choice and on/off switches for email notifications, split into tabs." },
  { id: "order-history", text: "My last three orders in a table, with their dates, number of items and status." },
  { id: "shipping-speed", text: "A form to choose a shipping speed (standard, express or overnight) and confirm it." },
  { id: "maintenance", text: "A warning that the app will be down for maintenance tonight, with a button to contact support." },
  { id: "plan-compare", text: "Compare three subscription plans by price and features, and let me pick one.", probe: "Asks for a choice the app has no tool for. A good reply shows the table and a choice, but doesn't invent a tool to change the plan." },
];

export async function renderPage(requests: readonly { id: string; text: string; probe?: string }[] = REQUESTS): Promise<string> {
  const { js, css } = await bundle();
  const firstMessage = `${buildSystemPrompt()}\n\n---\nThose are your instructions for this chat. I'll send screen requests next, one per message. For this first message, reply with just this comment line:\n# ready`;
  const data = JSON.stringify({ firstMessage, requests });
  // Replacement functions, not strings: the bundle contains "$'" and similar, which a string would expand.
  return PAGE.replace("/*OMNI_CSS*/", () => css.replace(/<\/(style)/gi, "<\\/$1"))
    .replace("/*OMNI_DATA*/", () => escapeScript(data))
    .replace("/*OMNI_CHECK*/", () => escapeScript(js));
}

const PAGE = String.raw`<meta charset="utf-8">
<title>Omni-IR Model Check</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  /* Layout: a short brief, then one row per test request: request and pasted reply on the left, the checked result and rendered screen on the right. */
  :root {
    --bg: #f6f7fb; --surface: #ffffff; --ink: #0f172a; --muted: #556079; --line: #e2e6ef;
    --accent: #4f46e5; --accent-soft: #eef0ff; --ok: #15803d; --ok-soft: #e7f6ec; --bad: #b42318; --bad-soft: #fdecea; --warn: #9a6700;
    --display: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0b1020; --surface: #131a2e; --ink: #e6e9f2; --muted: #9aa4bd; --line: #26304a; --accent: #a5b4fc; --accent-soft: #1d2445;
      --ok: #4ade80; --ok-soft: #12301f; --bad: #f97066; --bad-soft: #3a1714; --warn: #f5c451; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0b1020; --surface: #131a2e; --ink: #e6e9f2; --muted: #9aa4bd; --line: #26304a; --accent: #a5b4fc; --accent-soft: #1d2445;
    --ok: #4ade80; --ok-soft: #12301f; --bad: #f97066; --bad-soft: #3a1714; --warn: #f5c451; color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--ink); font: 400 1rem/1.55 var(--display); margin: 0; }
  .page { max-width: 76rem; margin: 0 auto; padding-inline: 1.25rem; padding-block: 2.25rem 4rem; display: grid; gap: 2rem; }
  header { display: grid; gap: .7rem; max-width: 46rem; }
  .eyebrow { font: 500 .75rem/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  h1 { font: 800 clamp(1.8rem, 4vw, 2.4rem)/1.1 var(--display); margin: 0; letter-spacing: -.02em; text-wrap: balance; }
  h2 { font: 700 1.2rem/1.3 var(--display); margin: 0; }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .facts { display: flex; flex-wrap: wrap; gap: .5rem; }
  .fact { font: 500 .78rem/1 var(--mono); padding: .45rem .65rem; border-radius: 999px; background: var(--accent-soft); }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 1.25rem; display: grid; gap: .8rem; }
  .steps { display: grid; gap: .5rem; padding-left: 1.2rem; margin: 0; }
  button { font: 600 .9rem/1 var(--display); border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 10px; padding: .6rem .85rem; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
  button:focus-visible, textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
  .request { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
  .request + .request { border-top: 1px solid var(--line); padding-top: 1.5rem; }
  .ask { display: grid; gap: .6rem; }
  .ask .text { font-weight: 600; }
  .probe { font-size: .88rem; color: var(--muted); }
  textarea { width: 100%; min-height: 9rem; resize: vertical; font: .82rem/1.5 var(--mono); color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: .7rem; }
  .result { display: grid; gap: .6rem; min-width: 0; }
  .badge { justify-self: start; font: 600 .8rem/1 var(--mono); padding: .4rem .6rem; border-radius: 999px; background: var(--accent-soft); color: var(--muted); }
  .badge.ok { background: var(--ok-soft); color: var(--ok); }
  .badge.bad { background: var(--bad-soft); color: var(--bad); }
  .issues { margin: 0; padding-left: 1.1rem; font: .8rem/1.5 var(--mono); }
  .issues .warning { color: var(--warn); }
  .issues .error { color: var(--bad); }
  .stage { border-radius: 12px; border: 1px solid var(--line); background: #f8fafc; color: #1f2329; padding: 1rem; overflow-x: auto; color-scheme: light; }
  .stage:empty { display: none; }
  .summary { font: 500 .9rem/1.5 var(--mono); }
  .copied { font-size: .85rem; color: var(--ok); }
  @media (max-width: 820px) { .request { grid-template-columns: minmax(0, 1fr); } }
  /*OMNI_CSS*/
</style>

<div class="page">
  <header>
    <div class="eyebrow">Free model check</div>
    <h1>How well does Claude write Omni-IR?</h1>
    <p class="muted">Run the screen requests below in your own Claude.ai chat (free plan is fine, no API key, nothing billed), paste each reply here, and this page checks it with the real Omni-IR parser and renders it with the Trusted Catalog. Nothing you paste leaves this page.</p>
    <div class="facts"><span class="fact">real parser and catalog</span><span class="fact">same tools and pictures as the app</span><span class="fact">replies stay in your browser</span></div>
  </header>

  <section class="panel">
    <h2>1 · Give Claude the instructions</h2>
    <ol class="steps">
      <li>Open <b>claude.ai</b> and start a <b>new chat</b>.</li>
      <li>Copy the instructions below, paste them as your first message, and send. Claude should answer with <code># ready</code>.</li>
      <li>Then send the requests in step 2 one at a time, in the same chat, and paste each reply under its request.</li>
    </ol>
    <div class="row"><button class="primary" id="copy-prompt" type="button">Copy the instructions</button><span class="copied" id="prompt-copied" hidden>Copied</span><span class="muted" id="prompt-size"></span></div>
  </section>

  <section class="panel">
    <h2>2 · Send each request, paste each reply</h2>
    <div id="requests" style="display:grid;gap:1.5rem"></div>
  </section>

  <section class="panel">
    <h2>3 · Send the results back</h2>
    <p class="muted">Copy the results and paste them into your chat with Claude Code. They include each reply, so the analysis can quote the exact lines.</p>
    <p class="summary" id="summary">No replies yet.</p>
    <div class="row"><button class="primary" id="copy-results" type="button">Copy results</button><span class="copied" id="results-copied" hidden>Copied</span></div>
  </section>
</div>

<script type="application/json" id="omni-data">/*OMNI_DATA*/</script>
<script>/*OMNI_CHECK*/</script>
<script>
  const data = JSON.parse(document.getElementById("omni-data").textContent);
  const results = {};
  const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  async function copy(text, note, fallback) {
    try { await navigator.clipboard.writeText(text); note.hidden = false; setTimeout(() => (note.hidden = true), 1600); }
    catch { if (fallback) { fallback.value = text; fallback.focus(); fallback.select(); } }
  }

  const promptBox = document.createElement("textarea");
  promptBox.hidden = true;
  promptBox.id = "prompt-fallback";
  document.getElementById("copy-prompt").after(promptBox);
  document.getElementById("prompt-size").textContent = (data.firstMessage.length / 1000).toFixed(1) + "k characters";
  document.getElementById("copy-prompt").onclick = () => copy(data.firstMessage, document.getElementById("prompt-copied"), Object.assign(promptBox, { hidden: false }));

  const list = document.getElementById("requests");
  for (const [i, req] of data.requests.entries()) {
    const row = document.createElement("div");
    row.className = "request";
    row.innerHTML =
      '<div class="ask"><div class="row"><b class="muted">' + (i + 1) + '</b><span class="text"></span></div>' +
      '<p class="probe" hidden></p>' +
      '<div class="row"><button type="button">Copy request</button><span class="copied" hidden>Copied</span></div>' +
      '<label class="muted" for="reply-' + req.id + '">Claude’s reply</label>' +
      '<textarea id="reply-' + req.id + '" spellcheck="false" placeholder="Paste the reply here"></textarea></div>' +
      '<div class="result"><span class="badge">Waiting for a reply</span><ul class="issues"></ul><div class="stage"></div></div>';
    row.querySelector(".text").textContent = req.text;
    if (req.probe) { const p = row.querySelector(".probe"); p.textContent = req.probe; p.hidden = false; }
    row.querySelector("button").onclick = () => copy(req.text, row.querySelector(".copied"));
    const area = row.querySelector("textarea");
    const badge = row.querySelector(".badge");
    const issues = row.querySelector(".issues");
    const stage = row.querySelector(".stage");
    const run = () => {
      const text = area.value;
      store.set("omni-check:" + req.id, text);
      issues.replaceChildren();
      if (!text.trim()) { badge.className = "badge"; badge.textContent = "Waiting for a reply"; delete results[req.id]; stage.replaceChildren(); summarize(); return; }
      const r = OmniCheck.check(text, stage);
      results[req.id] = { request: req.text, reply: text, ...r };
      badge.className = "badge " + (r.errors.length ? "bad" : "ok");
      badge.textContent = r.errors.length ? r.errors.length + " error(s) · " + r.components + " components" : "Valid · " + r.components + " components" + (r.warnings.length ? " · " + r.warnings.length + " warning(s)" : "");
      const add = (cls, f) => { const li = document.createElement("li"); li.className = cls; li.textContent = (f.line ? "line " + f.line + ": " : "end: ") + f.code + " — " + f.message; issues.append(li); };
      r.errors.forEach((f) => add("error", f));
      r.warnings.forEach((f) => add("warning", f));
      if (r.codeFences) { const li = document.createElement("li"); li.className = "warning"; li.textContent = "The reply is wrapped in Markdown code fences (three backticks); the prompt asks for Omni-IR lines only."; issues.append(li); }
      summarize();
    };
    area.addEventListener("input", run);
    area.value = store.get("omni-check:" + req.id);
    list.append(row);
    if (area.value) run();
  }

  function summarize() {
    const done = Object.values(results);
    const valid = done.filter((r) => !r.errors.length).length;
    document.getElementById("summary").textContent = done.length ? valid + " of " + done.length + " replies valid, of " + data.requests.length + " requests." : "No replies yet.";
  }

  document.getElementById("copy-results").onclick = () => {
    const lines = ["Omni-IR model check results", ""];
    for (const req of data.requests) {
      const r = results[req.id];
      lines.push("## " + req.id + ": " + req.text);
      if (!r) { lines.push("(no reply)", ""); continue; }
      lines.push("valid: " + !r.errors.length + " · components: " + r.components + " · governed buttons: " + r.governed + " · code fences: " + r.codeFences);
      for (const f of [...r.errors, ...r.warnings]) lines.push("- " + (f.line ? "line " + f.line : "end") + ": " + f.code + ": " + f.message);
      lines.push("reply:", r.reply.trim(), "");
    }
    copy(lines.join("\n"), document.getElementById("results-copied"));
  };
</script>
`;

if (process.argv[1]?.endsWith("model-check-page.ts")) {
  const out = process.argv[2] ?? "model-check.html";
  const requests = process.argv.includes("--step10") ? STEP10_REQUESTS : REQUESTS;
  writeFileSync(out, await renderPage(requests));
  console.log(`wrote ${out}`);
}
