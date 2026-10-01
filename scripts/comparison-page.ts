// npm run comparison:page -- out.html
// The review page for the format comparison (PLAN-COMPARISON.md, D.1): charts and tables built from
// benchmarks/results.json and benchmarks/capabilities.ts. Static HTML plus a small hover script.
import { readFileSync, writeFileSync } from "node:fs";
import { CAPABILITIES, CAPABILITY_FORMATS } from "../benchmarks/capabilities";
import type { Results, ScreenResult } from "../benchmarks/run";

const RELIABILITY_PAGE = "https://claude.ai/artifact/5Ae5aFVfZDM1pM8nSyFbq9";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (x: number) => Math.round(x).toLocaleString("en-US");
type Set = "omni" | "openui";
const SET_LABEL: Record<Set, string> = { omni: "Model-check screens (9)", openui: "OpenUI's published scenarios (7)" };

/** A tick step giving 4–6 ticks up to max. */
function ticks(max: number): number[] {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => max / s <= 6) ?? mag * 10;
  const out: number[] = [];
  // Up to the first tick at or above max, so the longest mark stays inside the scale.
  for (let t = 0; out.length === 0 || (out.at(-1) as number) < max; t += step) out.push(t);
  return out;
}

function axis(max: number, scaleMax: number): string {
  return `<div class="axis" aria-hidden="true"><span></span><div class="axis__track">${ticks(max)
    .map((t) => `<span class="tick" style="left:${(t / scaleMax) * 100}%">${n(t)}</span>`)
    .join("")}</div></div>`;
}

function sizeChart(results: Results, set: Set): string {
  const totals = results.totals[set];
  const base = totals["omni-ir"] as number;
  const rows = results.formats
    .filter((f) => totals[f.id] !== undefined)
    .map((f) => ({ id: f.id, label: f.label, value: totals[f.id] as number }))
    .sort((a, b) => a.value - b.value);
  const max = Math.max(...rows.map((r) => r.value));
  const scaleMax = ticks(max).at(-1) as number;
  const body = rows
    .map(
      (r) => `<div class="bar-row${r.id === "omni-ir" ? " is-omni" : ""}" tabindex="0" data-tip="${esc(`${r.label}: ${n(r.value)} tokens, ${(r.value / base).toFixed(2)}× Omni-IR`)}">
  <span class="bar-row__label">${esc(r.label)}</span>
  <div class="bar-row__track"><span class="bar" style="width:${(r.value / scaleMax) * 100}%"></span><span class="bar-row__value">${n(r.value)}<small>${(r.value / base).toFixed(2)}×</small></span></div>
</div>`,
    )
    .join("\n");
  return `<figure class="chart"><figcaption><b>${SET_LABEL[set]}</b><span>total tokens, fewest first</span></figcaption>${body}${axis(max, scaleMax)}</figure>`;
}

function avg(screens: ScreenResult[], id: string, k: "firstTokens" | "halfTokens"): number | undefined {
  const xs = screens.flatMap((s) => (s.streaming[id] ? [s.streaming[id][k]] : []));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

function streamingChart(results: Results, set: Set): string {
  const screens = results.screens.filter((s) => s.set === set);
  const rows = results.formats.flatMap((f) => {
    const first = avg(screens, f.id, "firstTokens");
    const half = avg(screens, f.id, "halfTokens");
    const total = screens.reduce((a, s) => a + (s.tokens[f.id] ?? 0), 0) / screens.length;
    return first === undefined || half === undefined ? [] : [{ id: f.id, label: f.label, first, half, atEnd: first >= total - 0.5 }];
  });
  const max = Math.max(...rows.map((r) => r.half));
  const scaleMax = ticks(max).at(-1) as number;
  const x = (v: number) => (v / scaleMax) * 100;
  const body = rows
    .map(
      (r) => `<div class="bar-row dumbbell${r.id === "omni-ir" ? " is-omni" : ""}" tabindex="0" data-tip="${esc(
        r.atEnd ? `${r.label}: nothing can be drawn until the whole reply (${n(r.first)} tokens) has arrived` : `${r.label}: first content after ${n(r.first)} tokens, half after ${n(r.half)}`,
      )}">
  <span class="bar-row__label">${esc(r.label)}</span>
  <div class="bar-row__track"><span class="db-line" style="left:${x(r.first)}%;width:${x(r.half) - x(r.first)}%"></span><span class="dot dot--first" style="left:${x(r.first)}%"></span><span class="dot dot--half" style="left:${x(r.half)}%"></span>${
        r.atEnd ? `<span class="db-note" style="left:${x(r.half)}%">at the end</span>` : ""
      }</div>
</div>`,
    )
    .join("\n");
  return `<figure class="chart"><figcaption><b>${SET_LABEL[set]}</b><span>tokens before content can be drawn (average)</span></figcaption>${body}${axis(max, scaleMax)}</figure>`;
}

function screenTable(results: Results, set: Set): string {
  const formats = results.formats.filter((f) => f.sets.includes(set));
  const screens = results.screens.filter((s) => s.set === set);
  const head = `<tr><th scope="col">Screen</th>${formats.map((f) => `<th scope="col" class="num">${esc(f.label)}</th>`).join("")}</tr>`;
  const rows = screens.map((s) => `<tr><th scope="row">${esc(s.name)}</th>${formats.map((f) => `<td class="num${f.id === "omni-ir" ? " is-omni" : ""}">${n(s.tokens[f.id] as number)}</td>`).join("")}</tr>`);
  const totals = results.totals[set];
  rows.push(`<tr class="total"><th scope="row">Total</th>${formats.map((f) => `<td class="num${f.id === "omni-ir" ? " is-omni" : ""}">${n(totals[f.id] as number)}</td>`).join("")}</tr>`);
  return `<div class="table-wrap"><table><caption>${SET_LABEL[set]}: tokens per screen</caption><thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function coverage(results: Results, set: Set): string {
  const screens = results.screens.filter((s) => s.set === set);
  const ok = screens.filter((s) => !s.noCounterpart.length).length;
  const other = set === "omni" ? "OpenUI's library" : "Omni-IR's catalog";
  const items = screens
    .map(
      (s) => `<li class="${s.noCounterpart.length ? "no" : "yes"}"><span class="cov-icon" aria-hidden="true">${s.noCounterpart.length ? "✕" : "✓"}</span><span><b>${esc(s.name)}</b>${
        s.noCounterpart.length ? `<small>needs ${esc(s.noCounterpart.join(", "))}</small>` : "<small>drawable there too</small>"
      }</span></li>`,
    )
    .join("");
  return `<div class="cov"><p class="cov__head"><span class="cov__big">${ok} of ${screens.length}</span> ${set === "omni" ? "model-check screens" : "OpenUI scenarios"} can be drawn by ${other} unchanged</p><ul>${items}</ul></div>`;
}

function capabilityTable(): string {
  const head = `<tr><th scope="col"></th>${CAPABILITY_FORMATS.map((f) => `<th scope="col"${f === "Omni-IR" ? ' class="is-omni"' : ""}>${esc(f)}</th>`).join("")}</tr>`;
  const rows = CAPABILITIES.map(
    (r) =>
      `<tr><th scope="row">${esc(r.question)}</th>${r.cells
        .map((c, i) => `<td${i === 0 ? ' class="is-omni"' : ""}>${esc(c.text)}${c.source ? `<small>${esc(c.source)}</small>` : ""}</td>`)
        .join("")}</tr>`,
  );
  return `<div class="table-wrap"><table class="caps"><thead>${head}</thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export function renderPage(results: Results): string {
  const t = results.totals;
  const pctFewer = (set: Set, id: string) => Math.round((1 - (t[set]["omni-ir"] as number) / (t[set][id] as number)) * 100);
  const openuiLead = (set: Set) => Math.round((1 - (t[set]["openui-lang"] as number) / (t[set]["omni-ir"] as number)) * 100);
  return PAGE.replace("{{SIZE}}", sizeChart(results, "omni") + sizeChart(results, "openui"))
    .replace("{{STREAM}}", streamingChart(results, "omni") + streamingChart(results, "openui"))
    .replace("{{TABLES}}", screenTable(results, "omni") + screenTable(results, "openui"))
    .replace("{{COVERAGE}}", coverage(results, "omni") + coverage(results, "openui"))
    .replace("{{CAPS}}", capabilityTable())
    .replaceAll("{{A2UI}}", String(pctFewer("omni", "a2ui")))
    .replaceAll("{{JR}}", String(pctFewer("omni", "json-render")))
    .replaceAll("{{HTML}}", String(pctFewer("omni", "html")))
    .replaceAll("{{JSX}}", String(pctFewer("omni", "jsx")))
    .replaceAll("{{OUI1}}", String(openuiLead("omni")))
    .replaceAll("{{OUI2}}", String(openuiLead("openui")))
    .replaceAll("{{RELIABILITY}}", RELIABILITY_PAGE);
}

const PAGE = String.raw`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Format Comparison Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
  :root {
    --bg: #f6f7fb; --surface: #ffffff; --ink: #0f172a; --muted: #556079; --line: #e2e6ef; --grid: #edf0f5;
    --accent: #4f46e5; --accent-soft: #eef0ff;
    --series-1: #2a78d6; --series-2: #eb6834; --rest: #b4b9c6; --omni-soft: #e8f1fc;
    --ok: #15803d; --bad: #b42318;
    --display: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0b1020; --surface: #131a2e; --ink: #e6e9f2; --muted: #9aa4bd; --line: #26304a; --grid: #1c2439; --accent: #a5b4fc; --accent-soft: #1d2445;
      --series-1: #3987e5; --series-2: #d95926; --rest: #4a5470; --omni-soft: #14243f; --ok: #4ade80; --bad: #f97066; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0b1020; --surface: #131a2e; --ink: #e6e9f2; --muted: #9aa4bd; --line: #26304a; --grid: #1c2439; --accent: #a5b4fc; --accent-soft: #1d2445;
    --series-1: #3987e5; --series-2: #d95926; --rest: #4a5470; --omni-soft: #14243f; --ok: #4ade80; --bad: #f97066; color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--ink); font: 400 1rem/1.55 var(--display); margin: 0; }
  .page { max-width: 72rem; margin: 0 auto; padding-inline: 1.25rem; padding-block: 2.25rem 4rem; display: grid; gap: 2.5rem; }
  header { display: grid; gap: .8rem; max-width: 50rem; }
  .eyebrow { font: 500 .75rem/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  h1 { font: 800 clamp(1.8rem, 4vw, 2.5rem)/1.1 var(--display); margin: 0; letter-spacing: -.02em; text-wrap: balance; }
  h2 { font: 700 1.35rem/1.25 var(--display); margin: 0; text-wrap: balance; }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .lede { font-size: 1.05rem; max-width: 46rem; }
  .status { justify-self: start; font: 500 .78rem/1 var(--mono); padding: .45rem .65rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
  section { display: grid; gap: 1rem; }
  section > p { max-width: 46rem; }
  .findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: .75rem; }
  .finding { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; display: grid; gap: .35rem; align-content: start; }
  .finding b { font-size: .95rem; }
  .finding p { font-size: .9rem; color: var(--muted); }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 30rem), 1fr)); gap: 1rem; }
  .chart { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1rem .75rem; display: grid; gap: .45rem; min-width: 0; }
  .chart figcaption { display: grid; gap: .1rem; margin-bottom: .35rem; }
  .chart figcaption span { font-size: .82rem; color: var(--muted); }
  .bar-row { display: grid; grid-template-columns: minmax(6.5rem, 11rem) minmax(0, 1fr); gap: .6rem; align-items: center; min-height: 1.9rem; border-radius: 6px; outline: none; }
  .bar-row:hover, .bar-row:focus-visible { background: var(--grid); }
  .bar-row__label { font-size: .82rem; line-height: 1.25; color: var(--muted); }
  .is-omni .bar-row__label { color: var(--ink); font-weight: 700; }
  .bar-row__track { position: relative; height: 1.9rem; display: flex; align-items: center; }
  .bar { display: block; height: .9rem; background: var(--rest); border-radius: 0 4px 4px 0; }
  .is-omni .bar { background: var(--series-1); }
  .bar-row__value { font: 500 .75rem/1 var(--mono); padding-left: .4rem; white-space: nowrap; color: var(--ink); display: flex; gap: .35rem; align-items: baseline; }
  .bar-row__value small { color: var(--muted); font-size: .7rem; }
  .axis { display: grid; grid-template-columns: minmax(6.5rem, 11rem) minmax(0, 1fr); gap: .6rem; border-top: 1px solid var(--line); padding-top: .3rem; }
  .axis__track { position: relative; height: 1rem; margin-right: 2.2rem; }
  .bar-row__track { margin-right: 2.2rem; }
  .tick { position: absolute; transform: translateX(-50%); font: .68rem/1 var(--mono); color: var(--muted); }
  .tick:first-child { transform: none; }
  .dumbbell .bar-row__track { margin-right: 2.2rem; }
  .db-line { position: absolute; height: 2px; background: var(--rest); top: 50%; transform: translateY(-50%); }
  .is-omni .db-line { background: var(--series-1); }
  .dot { position: absolute; top: 50%; width: .7rem; height: .7rem; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 2px var(--surface); }
  .dot--first { background: var(--series-1); }
  .dot--half { background: var(--series-2); }
  .db-note { position: absolute; top: 50%; transform: translate(-100%, -50%); margin-left: -.7rem; font: .7rem/1 var(--mono); color: var(--muted); white-space: nowrap; padding-right: .7rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .82rem; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: .4rem; }
  .legend i { width: .7rem; height: .7rem; border-radius: 50%; display: inline-block; }
  .legend i.sq { border-radius: 2px; }
  .table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: .84rem; }
  caption { text-align: left; font-weight: 700; padding: .8rem 1rem .2rem; }
  th, td { padding: .5rem .75rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
  td.num, th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.is-omni, th.is-omni { background: var(--omni-soft); }
  tr.total th, tr.total td { font-weight: 700; border-bottom: 0; }
  tbody th { font-weight: 600; }
  .caps { min-width: 68rem; }
  .caps td { min-width: 10rem; }
  .caps td small { display: block; margin-top: .25rem; font: .68rem/1.3 var(--mono); color: var(--muted); }
  .caps tbody th { width: 9rem; }
  .tables { display: grid; gap: 1rem; }
  details { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .8rem 1rem; }
  details[open] { display: grid; gap: .8rem; }
  summary { cursor: pointer; font-weight: 600; }
  .covs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 1rem; }
  .cov { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 1rem; display: grid; gap: .7rem; align-content: start; }
  .cov__head { font-size: .9rem; color: var(--muted); }
  .cov__big { display: block; font: 800 1.8rem/1.1 var(--display); color: var(--ink); }
  .cov ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
  .cov li { display: grid; grid-template-columns: 1.4rem minmax(0, 1fr); gap: .4rem; font-size: .86rem; }
  .cov li small { display: block; color: var(--muted); font-size: .78rem; }
  .cov-icon { font-weight: 700; }
  .cov li.yes .cov-icon { color: var(--ok); }
  .cov li.no .cov-icon { color: var(--bad); }
  .pending { background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; padding: 1rem; display: grid; gap: .5rem; }
  ul.notes { margin: 0; padding-left: 1.2rem; display: grid; gap: .45rem; max-width: 50rem; }
  a { color: var(--accent); }
  code { font: .85em var(--mono); }
  #tip { position: fixed; z-index: 10; pointer-events: none; background: var(--ink); color: var(--bg); font: 500 .78rem/1.35 var(--display); padding: .45rem .6rem; border-radius: 8px; max-width: 18rem; }
  @media (max-width: 520px) {
    .bar-row, .axis { grid-template-columns: minmax(5.5rem, 7rem) minmax(0, 1fr); gap: .4rem; }
    .bar-row__value small { display: none; }
  }
</style>

<div class="page">
  <header>
    <div class="eyebrow">Omni-IR · Step 9 · format comparison</div>
    <h1>How Omni-IR compares with OpenUI Lang, A2UI and json-render</h1>
    <p class="lede muted">The same 16 screens written in each format, counted with the tokenizer OpenUI's benchmark uses, plus what each format lets a model do. Measured offline on 2026-10-01; nothing here called a paid API.</p>
    <span class="status">Draft for your review · reliability runs still to do</span>
  </header>

  <section aria-labelledby="h-findings">
    <h2 id="h-findings">What the numbers say</h2>
    <div class="findings">
      <div class="finding"><b>Same class as OpenUI Lang, not smaller</b><p>OpenUI Lang uses {{OUI1}}% fewer tokens on the model-check screens and {{OUI2}}% fewer on its own scenarios: it has positional arguments and inline components.</p></div>
      <div class="finding"><b>Well below the JSON formats</b><p>On the model-check screens Omni-IR uses {{A2UI}}% fewer tokens than A2UI, {{JR}}% fewer than json-render, {{HTML}}% fewer than HTML with Tailwind and {{JSX}}% fewer than React JSX.</p></div>
      <div class="finding"><b>Line formats draw first</b><p>Omni-IR and OpenUI Lang can draw content after about 30–40 tokens. A2UI in one message and JSX show nothing until the reply ends.</p></div>
      <div class="finding"><b>The catalog is the gap</b><p>Omni-IR's 15 components can draw none of OpenUI's 7 scenarios unchanged: they need tables, charts, dropdowns or tabs.</p></div>
      <div class="finding"><b>The difference is control</b><p>No logic in the stream, pictures only by name, every data-changing action governed and its params checked, a conformance suite, three native renderers.</p></div>
    </div>
  </section>

  <section aria-labelledby="h-size">
    <h2 id="h-size">Size: tokens for the same screens</h2>
    <p class="muted">Every format carries the same components and props, so this compares syntax only, as OpenUI's own benchmark does. Lower is smaller. Hover or focus a bar for its numbers.</p>
    <div class="legend"><span><i class="sq" style="background:var(--series-1)"></i>Omni-IR</span><span><i class="sq" style="background:var(--rest)"></i>Other formats</span></div>
    <div class="charts">{{SIZE}}</div>
    <details><summary>Tokens per screen (table)</summary><div class="tables">{{TABLES}}</div></details>
  </section>

  <section aria-labelledby="h-stream">
    <h2 id="h-stream">Streaming: when can the screen start to appear?</h2>
    <p class="muted">Tokens that must arrive before the first piece of content can be drawn, and before half of it can. A component counts once it and everything above it have fully arrived; layout containers don't count.</p>
    <div class="legend"><span><i style="background:var(--series-1)"></i>First content</span><span><i style="background:var(--series-2)"></i>Half of the content</span></div>
    <div class="charts">{{STREAM}}</div>
  </section>

  <section aria-labelledby="h-cov">
    <h2 id="h-cov">Coverage: which library can draw which screen</h2>
    <p class="muted">Components with no counterpart in the other library. Close counterparts (Text and TextContent, Badge and Tag, DateInput and DatePicker…) count as drawable.</p>
    <div class="covs">{{COVERAGE}}</div>
  </section>

  <section aria-labelledby="h-caps">
    <h2 id="h-caps">What each format lets a model do</h2>
    <p class="muted">Every cell names its source: a file in the Omni-IR repo or a pinned copy of the other project's spec under <code>benchmarks/sources/</code>.</p>
    {{CAPS}}
  </section>

  <section aria-labelledby="h-rel">
    <h2 id="h-rel">Reliability: waiting for your runs</h2>
    <div class="pending">
      <p>The same nine requests as the first model check, run once in Omni-IR (current prompt) and once in OpenUI Lang (OpenUI's published prompt), each in its own fresh Claude.ai chat and checked by its own parser. About 20 minutes, free.</p>
      <p><a href="{{RELIABILITY}}">Open the reliability check page</a> · earlier result: Omni-IR 9 of 9 valid on the first try.</p>
    </div>
  </section>

  <section aria-labelledby="h-method">
    <h2 id="h-method">How this was measured, and its limits</h2>
    <ul class="notes">
      <li>Screens: the nine model-check replies (written by Claude in Omni-IR) and OpenUI's seven published scenarios (written in OpenUI Lang). Every other format is converted from the same structure by a script; all outputs are committed under <code>benchmarks/out/</code>.</li>
      <li>Converters checked: OpenUI's json-render files are reproduced byte for byte; OpenUI's own parser accepts all 16 OpenUI Lang outputs; every A2UI message validates against A2UI's schema; Omni-IR outputs read back identically.</li>
      <li>Tokens: tiktoken's GPT-5 encoding, as in OpenUI's benchmark. Claude's tokenizer would give other absolute numbers.</li>
      <li>Limits: 16 screens; converters written by this project; each screen set suits its own library; size says nothing about output quality, which the reliability runs address.</li>
      <li>Not run: Thesys's paid 46-brief benchmark (optional, only with your go-ahead).</li>
      <li>Full write-up with every table: <code>docs/COMPARISON.md</code>. Reproduce with <code>npm run bench</code>.</li>
    </ul>
  </section>
</div>
<div id="tip" hidden></div>
<script>
  const tip = document.getElementById("tip");
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.hidden = false; const r = tip.getBoundingClientRect(); tip.style.left = Math.min(x + 12, innerWidth - r.width - 8) + "px"; tip.style.top = Math.max(8, y - r.height - 10) + "px"; };
  for (const el of document.querySelectorAll("[data-tip]")) {
    el.addEventListener("mousemove", (e) => show(el, e.clientX, e.clientY));
    el.addEventListener("mouseleave", () => (tip.hidden = true));
    el.addEventListener("focus", () => { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); });
    el.addEventListener("blur", () => (tip.hidden = true));
  }
</script>
`;

if (process.argv[1]?.endsWith("comparison-page.ts")) {
  const out = process.argv[2] ?? "comparison.html";
  const results = JSON.parse(readFileSync("benchmarks/results.json", "utf8")) as Results;
  writeFileSync(out, renderPage(results));
  console.log(`wrote ${out}`);
}
