// npm run reliability:page -- out.html
// The reliability check for the format comparison (PLAN-COMPARISON.md, C.3): the same nine requests
// as the first model check, written once in Omni-IR (its current system prompt) and once in OpenUI
// Lang (the system prompt OpenUI publishes with its benchmark), each in a fresh Claude.ai chat.
// Every reply is checked by its own format's parser: Omni-IR's is bundled in; OpenUI's
// (@openuidev/lang-core 0.3.0) loads from cdn.jsdelivr.net when the page opens. Nothing calls an API.
import { readFileSync, writeFileSync } from "node:fs";
import { buildSystemPrompt } from "../server/prompt";
import { REQUESTS, bundle } from "./model-check-page";

const OPENUI_PARSER = "https://cdn.jsdelivr.net/npm/@openuidev/lang-core@0.3.0/+esm";
const escapeScript = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
const SUFFIX = "\n\n---\nThose are your instructions for this chat. I'll send screen requests next, one per message.";

export async function renderPage(): Promise<string> {
  const { js, css } = await bundle();
  const openuiPrompt = readFileSync("benchmarks/sources/openui/system-prompt.txt", "utf8").trimEnd();
  const data = {
    parser: OPENUI_PARSER,
    openuiSchema: JSON.parse(readFileSync("benchmarks/sources/openui/schema.json", "utf8")),
    requests: REQUESTS,
    formats: [
      {
        id: "omni",
        label: "Omni-IR",
        source: "Omni-IR's system prompt (server/prompt.ts), with the app's tools and pictures",
        parser: "Omni-IR's parser, tool and picture registries (bundled)",
        firstMessage: `${buildSystemPrompt()}${SUFFIX} For this first message, reply with just this comment line:\n# ready`,
      },
      {
        id: "openui",
        label: "OpenUI Lang",
        source: "The system prompt OpenUI publishes with its benchmark (thesysdev/openui 97e8335)",
        parser: "OpenUI's own parser, @openuidev/lang-core 0.3.0, with its benchmark library",
        firstMessage: `${openuiPrompt}${SUFFIX} For this first message, reply with just the word: ready`,
      },
    ],
  };
  return PAGE.replace("/*OMNI_CSS*/", () => css.replace(/<\/(style)/gi, "<\\/$1"))
    .replace("/*PAGE_DATA*/", () => escapeScript(JSON.stringify(data)))
    .replace("/*OMNI_CHECK*/", () => escapeScript(js));
}

const PAGE = String.raw`<meta charset="utf-8">
<title>Format Reliability Check</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
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
  .page { max-width: 76rem; margin: 0 auto; padding-inline: 1.25rem; padding-block: 2.25rem 4rem; display: grid; gap: 1.5rem; }
  header { display: grid; gap: .7rem; max-width: 48rem; }
  .eyebrow { font: 500 .75rem/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  h1 { font: 800 clamp(1.8rem, 4vw, 2.4rem)/1.1 var(--display); margin: 0; letter-spacing: -.02em; text-wrap: balance; }
  h2 { font: 700 1.2rem/1.3 var(--display); margin: 0; }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 1.25rem; display: grid; gap: .8rem; }
  .steps { display: grid; gap: .5rem; padding-left: 1.2rem; margin: 0; }
  button { font: 600 .9rem/1 var(--display); border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 10px; padding: .6rem .85rem; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); }
  button:focus-visible, textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
  .tabs { display: flex; flex-wrap: wrap; gap: .5rem; }
  .tabs button { display: grid; gap: .3rem; text-align: left; padding: .75rem 1rem; min-width: 12rem; }
  .tabs button[aria-selected="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .tabs .score { font: 500 .78rem/1 var(--mono); color: var(--muted); }
  .tabpanel { display: grid; gap: 1.5rem; }
  .tabpanel[hidden] { display: none; }
  .facts { font: .82rem/1.5 var(--mono); color: var(--muted); display: grid; gap: .2rem; }
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
  .outline { font: .78rem/1.55 var(--mono); margin: 0; white-space: pre; }
  .summary { font: 500 .9rem/1.5 var(--mono); }
  .copied { font-size: .85rem; color: var(--ok); }
  @media (max-width: 820px) { .request { grid-template-columns: minmax(0, 1fr); } }
  /*OMNI_CSS*/
</style>

<div class="page">
  <header>
    <div class="eyebrow">Format comparison · reliability</div>
    <h1>Does Claude write each format validly on the first try?</h1>
    <p class="muted">The same nine screen requests, written once in Omni-IR and once in OpenUI Lang, each in its own fresh Claude.ai chat (free plan is fine, nothing billed). Each reply is checked by its own format's parser. Nothing you paste leaves this page.</p>
  </header>

  <div class="tabs" role="tablist" id="tabs"></div>
  <div id="panels"></div>

  <section class="panel">
    <h2>Send the results back</h2>
    <p class="muted">Copy the results (both formats, with every reply) and paste them into your chat with Claude Code.</p>
    <p class="summary" id="summary">No replies yet.</p>
    <div class="row"><button class="primary" id="copy-results" type="button">Copy results</button><span class="copied" id="results-copied" hidden>Copied</span></div>
  </section>
</div>

<script type="application/json" id="page-data">/*PAGE_DATA*/</script>
<script>/*OMNI_CHECK*/</script>
<script>
  const data = JSON.parse(document.getElementById("page-data").textContent);
  const results = { omni: {}, openui: {} };
  const store = { get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  let openui = null; // OpenUI's parser module once loaded
  const openuiReady = import(data.parser).then((m) => (openui = m)).catch((e) => { openui = { failed: String(e) }; });

  async function copy(text, note, fallback) {
    try { await navigator.clipboard.writeText(text); note.hidden = false; setTimeout(() => (note.hidden = true), 1600); }
    catch { if (fallback) { fallback.hidden = false; fallback.value = text; fallback.focus(); fallback.select(); } }
  }

  // OpenUI Lang: valid when OpenUI's parser finds a root and reports no errors, missing references
  // or truncation. Text the prompt forbids (prose, code fences) and dropped statements are warnings.
  function checkOpenUI(text, stage) {
    if (!openui) return { pending: true };
    if (openui.failed) return { errors: [{ line: null, code: "parser_unavailable", message: "Couldn't load OpenUI's parser from cdn.jsdelivr.net: " + openui.failed }], warnings: [], components: 0, codeFences: false };
    const r = openui.createParser(data.openuiSchema, "Root").parse(text);
    const errors = [], warnings = [];
    if (!r.root) errors.push({ line: null, code: "no_root", message: "no root component" });
    if (r.meta.incomplete) errors.push({ line: null, code: "incomplete", message: "the reply ends in the middle of a statement" });
    for (const u of r.meta.unresolved) errors.push({ line: null, code: "unresolved", message: '"' + u + '" is used but never defined' });
    for (const e of r.meta.errors) errors.push({ line: null, code: e.code, message: (e.statementId ? e.statementId + ": " : "") + e.component + " " + e.path + " " + e.message });
    for (const o of r.meta.orphaned) warnings.push({ line: null, code: "orphaned", message: '"' + o + '" is not reachable from root, so it is not shown' });
    const lines = text.split("\n");
    let depth = 0;
    lines.forEach((l, i) => {
      const t = l.trim();
      if (depth === 0 && t && !/^(\$?[A-Za-z_][A-Za-z0-9_]*\s*=|\/\/)/.test(t)) warnings.push({ line: i + 1, code: "extra_text", message: "not a statement (the prompt asks for openui-lang only): " + t.slice(0, 60) });
      for (const c of l.replace(/"(?:[^"\\]|\\.)*"/g, "")) { if ("([{".includes(c)) depth++; else if (")]}".includes(c)) depth--; }
      if (depth < 0) depth = 0;
    });
    let components = 0;
    const out = [];
    const walk = (v, pad) => {
      if (Array.isArray(v)) { v.forEach((x) => walk(x, pad)); return; }
      if (!v || typeof v !== "object") return;
      if (v.type === "element") {
        components++;
        const label = Object.values(v.props).filter((x) => typeof x === "string").slice(0, 2).map((x) => JSON.stringify(x.length > 40 ? x.slice(0, 40) + "…" : x)).join(" ");
        out.push(pad + v.typeName + (label ? " " + label : ""));
        for (const x of Object.values(v.props)) walk(x, pad + "  ");
        return;
      }
      for (const x of Object.values(v)) walk(x, pad);
    };
    walk(r.root, "");
    const pre = document.createElement("pre");
    pre.className = "outline";
    pre.textContent = out.join("\n");
    stage.replaceChildren(pre);
    return { errors, warnings, components, codeFences: /^\s*` + "```" + String.raw`/m.test(text) };
  }

  const tabs = document.getElementById("tabs");
  const panels = document.getElementById("panels");
  const scoreEls = {};
  data.formats.forEach((fmt, fi) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.id = "tab-" + fmt.id;
    tab.innerHTML = '<b></b><span class="score">No replies yet</span>';
    tab.querySelector("b").textContent = fmt.label;
    scoreEls[fmt.id] = tab.querySelector(".score");
    tabs.append(tab);

    const panel = document.createElement("div");
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.className = "tabpanel";
    panel.innerHTML =
      '<section class="panel"><h2>1 · Give Claude the ' + fmt.label + ' instructions</h2>' +
      '<div class="facts"><span class="src"></span><span class="chk"></span></div>' +
      '<ol class="steps"><li>Open <b>claude.ai</b> and start a <b>new chat</b> (not the chat used for the other format).</li>' +
      '<li>Copy the instructions, paste them as your first message, and send. Claude should answer that it is ready.</li>' +
      '<li>Send the requests below one at a time in the same chat, and paste each reply under its request.</li></ol>' +
      '<div class="row"><button class="primary copy-prompt" type="button">Copy the instructions</button><span class="copied" hidden>Copied</span><span class="muted size"></span></div>' +
      '<textarea class="prompt-fallback" hidden></textarea></section>' +
      '<section class="panel"><h2>2 · Send each request, paste each reply</h2><div class="list" style="display:grid;gap:1.5rem"></div></section>';
    panel.querySelector(".src").textContent = "Prompt: " + fmt.source;
    panel.querySelector(".chk").textContent = "Checked by: " + fmt.parser;
    panel.querySelector(".size").textContent = (fmt.firstMessage.length / 1000).toFixed(1) + "k characters";
    panel.querySelector(".copy-prompt").onclick = () => copy(fmt.firstMessage, panel.querySelector(".copied"), panel.querySelector(".prompt-fallback"));
    panels.append(panel);

    const list = panel.querySelector(".list");
    for (const [i, req] of data.requests.entries()) {
      const row = document.createElement("div");
      row.className = "request";
      row.innerHTML =
        '<div class="ask"><div class="row"><b class="muted">' + (i + 1) + '</b><span class="text"></span></div>' +
        '<p class="probe" hidden></p>' +
        '<div class="row"><button type="button">Copy request</button><span class="copied" hidden>Copied</span></div>' +
        '<label class="muted" for="reply-' + fmt.id + '-' + req.id + '">Claude’s reply</label>' +
        '<textarea id="reply-' + fmt.id + '-' + req.id + '" spellcheck="false" placeholder="Paste the reply here"></textarea></div>' +
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
        store.set("reliability:" + fmt.id + ":" + req.id, text);
        issues.replaceChildren();
        if (!text.trim()) { badge.className = "badge"; badge.textContent = "Waiting for a reply"; delete results[fmt.id][req.id]; stage.replaceChildren(); summarize(); return; }
        const r = fmt.id === "omni" ? OmniCheck.check(text, stage) : checkOpenUI(text, stage);
        if (r.pending) { badge.className = "badge"; badge.textContent = "Loading OpenUI's parser…"; openuiReady.then(run); return; }
        results[fmt.id][req.id] = { request: req.text, reply: text, ...r };
        badge.className = "badge " + (r.errors.length ? "bad" : "ok");
        badge.textContent = r.errors.length ? r.errors.length + " error(s) · " + r.components + " components" : "Valid · " + r.components + " components" + (r.warnings.length ? " · " + r.warnings.length + " warning(s)" : "");
        const add = (cls, f) => { const li = document.createElement("li"); li.className = cls; li.textContent = (f.line ? "line " + f.line + ": " : "") + f.code + " — " + f.message; issues.append(li); };
        r.errors.forEach((f) => add("error", f));
        r.warnings.forEach((f) => add("warning", f));
        if (r.codeFences) add("warning", { line: null, code: "code_fences", message: "the reply is wrapped in Markdown code fences (three backticks)" });
        summarize();
      };
      area.addEventListener("input", run);
      area.value = store.get("reliability:" + fmt.id + ":" + req.id);
      list.append(row);
      if (area.value) run();
    }
    tab.onclick = () => select(fi);
  });

  function select(index) {
    [...tabs.children].forEach((t, i) => t.setAttribute("aria-selected", String(i === index)));
    [...panels.children].forEach((p, i) => (p.hidden = i !== index));
    try { localStorage.setItem("reliability:tab", String(index)); } catch {}
  }
  let saved = 0;
  try { saved = Number(localStorage.getItem("reliability:tab")) || 0; } catch {}
  select(saved < data.formats.length ? saved : 0);

  function summarize() {
    const parts = [];
    for (const fmt of data.formats) {
      const done = Object.values(results[fmt.id]);
      const valid = done.filter((r) => !r.errors.length).length;
      scoreEls[fmt.id].textContent = done.length ? valid + " of " + done.length + " valid" : "No replies yet";
      if (done.length) parts.push(fmt.label + ": " + valid + " of " + done.length + " valid");
    }
    document.getElementById("summary").textContent = parts.length ? parts.join(" · ") + " (" + data.requests.length + " requests each)" : "No replies yet.";
  }

  document.getElementById("copy-results").onclick = () => {
    const lines = ["Format reliability check results", ""];
    for (const fmt of data.formats) {
      lines.push("# " + fmt.label, "");
      for (const req of data.requests) {
        const r = results[fmt.id][req.id];
        lines.push("## " + req.id + ": " + req.text);
        if (!r) { lines.push("(no reply)", ""); continue; }
        lines.push("valid: " + !r.errors.length + " · components: " + r.components + (r.governed !== undefined ? " · governed buttons: " + r.governed : "") + " · code fences: " + r.codeFences);
        for (const f of [...r.errors, ...r.warnings]) lines.push("- " + (f.line ? "line " + f.line + ": " : "") + f.code + ": " + f.message);
        lines.push("reply:", r.reply.trim(), "");
      }
    }
    copy(lines.join("\n"), document.getElementById("results-copied"));
  };
</script>
`;

if (process.argv[1]?.endsWith("reliability-page.ts")) {
  const out = process.argv[2] ?? "reliability.html";
  writeFileSync(out, await renderPage());
  console.log(`wrote ${out}`);
}
