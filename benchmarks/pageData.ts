// The comparison page's data (PLAN-COMPARE-PAGE.md A.3), written by `npm run bench` into
// site/landing/compare/data.json, so the page and docs/COMPARISON.md can never disagree. Offline and free.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createParser, ISSUE_CODES } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { CAPABILITIES, CAPABILITY_FORMATS, FORMAT_INTROS } from "./capabilities";
import type { Results } from "./run";
import { BENCH_DIR } from "./src/screens";

/** Where the page reads its data, relative to benchmarks/. */
export const PAGE_DATA = "../site/landing/compare/data.json";

/** Each screen's name in everyday words. */
const TITLES: Record<string, string> = {
  booking: "Booking a cabin",
  bag: "A shopping bag",
  assistant: "A trip assistant chat",
  "sign-in": "Signing in",
  order: "Where is my order?",
  support: "Contacting support",
  "outside-catalog": "A video player",
  styling: "A payment, with styling asked for",
  "no-tool": "Settings, with account deletion",
  "simple-table": "A simple table",
  "chart-with-data": "A chart",
  "contact-form": "A contact form",
  dashboard: "A dashboard",
  "pricing-page": "A pricing page",
  "settings-panel": "A settings panel",
  "e-commerce-product": "A product page",
};

/** Each format on the page: its everyday name and a few words about it. */
const FORMATS: Record<string, { name: string; intro: string }> = {
  "omni-ir": { name: "Omni-IR", intro: FORMAT_INTROS[0]! },
  "openui-lang": { name: "OpenUI Lang", intro: FORMAT_INTROS[1]! },
  a2ui: { name: "A2UI, all at once", intro: "Google's format, with the whole screen in one message, as most of its examples are written." },
  "a2ui-streamed": { name: "A2UI, piece by piece", intro: "Google's format, one message per part of the screen." },
  "json-render": { name: "json-render", intro: FORMAT_INTROS[3]! },
  html: { name: "HTML + Tailwind", intro: FORMAT_INTROS[4]! },
  jsx: { name: "React JSX", intro: FORMAT_INTROS[5]! },
};

/** Whether the real parser draws this Omni-IR with no errors, with the demo app's registries. */
function drawable(text: string): boolean {
  const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
  let errors = 0;
  parser.subscribe((e) => {
    if (e.type === "error") errors++;
    if (e.type === "end") errors += e.issues.filter((i) => ISSUE_CODES[i.code].severity === "error" && ISSUE_CODES[i.code].stage === "end").length;
  });
  parser.write(text.endsWith("\n") ? text : text + "\n");
  parser.end();
  return errors === 0;
}

/** One reply from the 2026-10-04 reliability run, by its request id. */
function reply(file: string, id: string): string {
  const text = readFileSync(join(BENCH_DIR, "reliability/2026-10-04", file), "utf8");
  const part = text.split(/^## /m).find((p) => p.startsWith(`${id}\n`));
  if (!part) throw new Error(`no "${id}" in ${file}`);
  return part.slice(id.length + 1).trim();
}

export function pageData(results: Results, files: ReadonlyMap<string, string>): string {
  const ext = Object.fromEntries(results.formats.map((f) => [f.id, f.ext]));
  const data = {
    measured: "2026-10-01",
    updated: "2026-10-11",
    tokenizer: results.tokenizer,
    formats: results.formats.map((f) => ({ id: f.id, ...FORMATS[f.id]! })),
    screens: results.screens.map((s) => {
      const texts = Object.fromEntries(Object.keys(s.tokens).map((id) => [id, files.get(`out/${s.set}/${s.name}.${ext[id]}`) ?? ""]));
      return {
        name: s.name,
        title: TITLES[s.name] ?? s.name,
        set: s.set,
        components: s.components,
        tokens: s.tokens,
        firstTokens: Object.fromEntries(Object.entries(s.streaming).map(([id, st]) => [id, st.firstTokens])),
        texts,
        drawable: drawable(texts["omni-ir"] ?? ""),
      };
    }),
    totals: results.totals,
    capabilities: { formats: CAPABILITY_FORMATS, intros: FORMAT_INTROS, rows: CAPABILITIES },
    story: {
      date: "2026-10-04",
      model: "Claude Opus 5.5, in fresh Claude.ai chats",
      request: "A settings screen with a button that permanently deletes my account.",
      omni: reply("omni-ir.txt", "no-tool"),
      openui: reply("openui-lang.txt", "no-tool"),
    },
  };
  return JSON.stringify(data, null, 1) + "\n";
}
