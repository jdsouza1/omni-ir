// The generated sections of docs/COMPARISON.md, written from results.json by `npm run bench`.
// Sections sit between <!-- generated:NAME --> and <!-- /generated:NAME --> markers, as in SPEC.md.
import { CAPABILITIES, CAPABILITY_FORMATS } from "./capabilities";
import type { Results, ScreenResult } from "./run";

const fmt = (n: number) => n.toLocaleString("en-US");
const ratio = (n: number, base: number) => `${(n / base).toFixed(2)}×`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

function sizeTable(results: Results, set: "omni" | "openui"): string {
  const formats = results.formats.filter((f) => f.sets.includes(set));
  const screens = results.screens.filter((s) => s.set === set);
  const head = `| Screen | ${formats.map((f) => f.label).join(" | ")} |`;
  const rule = `|---|${formats.map(() => "---:").join("|")}|`;
  const rows = screens.map((s) => `| ${s.name} | ${formats.map((f) => fmt(s.tokens[f.id] as number)).join(" | ")} |`);
  const totals = results.totals[set];
  const base = totals["omni-ir"] as number;
  rows.push(`| **Total** | ${formats.map((f) => `**${fmt(totals[f.id] as number)}**`).join(" | ")} |`);
  rows.push(`| Relative to Omni-IR | ${formats.map((f) => ratio(totals[f.id] as number, base)).join(" | ")} |`);
  return [head, rule, ...rows].join("\n");
}

function streamingTable(results: Results): string {
  const lines = [
    "| Format | Model-check screens: first content | half the content | OpenUI's scenarios: first content | half the content |",
    "|---|---:|---:|---:|---:|",
  ];
  const avg = (set: "omni" | "openui", id: string, k: "firstTokens" | "halfTokens" | "first" | "half") => {
    const xs = results.screens.filter((s) => s.set === set && s.streaming[id]).map((s) => (s.streaming[id] as ScreenResult["streaming"][string])[k]);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const cell = (set: "omni" | "openui", id: string, k: "first" | "half") => {
    const t = avg(set, id, k === "first" ? "firstTokens" : "halfTokens");
    const share = avg(set, id, k);
    return t === undefined || share === undefined ? "–" : `${Math.round(t)} (${pct(share)})`;
  };
  for (const f of results.formats) lines.push(`| ${f.label} | ${cell("omni", f.id, "first")} | ${cell("omni", f.id, "half")} | ${cell("openui", f.id, "first")} | ${cell("openui", f.id, "half")} |`);
  return lines.join("\n");
}

function calibrationTable(results: Results): string {
  const lines = [
    "| Scenario | OpenUI Lang (published) | as read and rewritten here | json-render (published) | rewritten here in OpenUI's style | C1 JSON (published / counted here) | YAML (published / counted here) |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const s of results.screens.filter((x) => x.openuiFiles)) {
    const o = s.openuiFiles as NonNullable<ScreenResult["openuiFiles"]>;
    lines.push(
      `| ${s.name} | ${fmt(o.published.openui)} | ${fmt(s.tokens["openui-lang"] as number)} | ${fmt(o.published.jsonRender)} | ${fmt(o.jsonRenderReproduced)} | ${fmt(o.published.c1)} / ${fmt(o.c1)} | ${fmt(o.published.yaml)} / ${fmt(o.yaml)} |`,
    );
  }
  return lines.join("\n");
}

function coverageTable(results: Results): string {
  const lines = ["| Screen | Set | Components | No counterpart in the other library |", "|---|---|---:|---|"];
  for (const s of results.screens) {
    lines.push(`| ${s.name} | ${s.set === "omni" ? "model check" : "OpenUI"} | ${s.components} | ${s.noCounterpart.length ? s.noCounterpart.join(", ") : "none: drawable there too"} |`);
  }
  return lines.join("\n");
}

function capabilityTable(): string {
  const head = `| | ${CAPABILITY_FORMATS.join(" | ")} |`;
  const rule = `|---|${CAPABILITY_FORMATS.map(() => "---").join("|")}|`;
  const rows = CAPABILITIES.map((r) => `| **${r.question}** | ${r.cells.map((c) => c.text.replace(/\|/g, "\\|") + (c.source ? ` <sub>${c.source}</sub>` : "")).join(" | ")} |`);
  return [head, rule, ...rows].join("\n");
}

export function renderSections(results: Results): Record<string, string> {
  return {
    "size-omni": sizeTable(results, "omni"),
    "size-openui": sizeTable(results, "openui"),
    streaming: streamingTable(results),
    calibration: calibrationTable(results),
    coverage: coverageTable(results),
    capabilities: capabilityTable(),
  };
}

export function fillSections(doc: string, sections: Record<string, string>): string {
  let out = doc;
  for (const [name, body] of Object.entries(sections)) {
    const re = new RegExp(`(<!-- generated:${name} -->)[\\s\\S]*?(<!-- /generated:${name} -->)`);
    if (!re.test(out)) throw new Error(`docs/COMPARISON.md has no generated:${name} section`);
    out = out.replace(re, (_, open: string, close: string) => `${open}\n${body}\n${close}`);
  }
  return out;
}
