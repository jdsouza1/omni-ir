// npm run bench              convert every screen into every format, measure, write the results
// npm run bench -- --check   exit 1 if any committed output or result is out of date (used by the tests)
//
// Offline and free: no model or API is called. See benchmarks/README.md and docs/COMPARISON.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { A2UI_BATCHED, A2UI_STREAMED, JSON_RENDER, JSX, OMNI, OPENUI, jsonRenderOpenUIStyle, type Format } from "./src/emit";
import { NO_COUNTERPART } from "./capabilities";
import { fillSections, renderSections } from "./report";
import { HTML } from "./src/html";
import { freeEncoder, round, streaming, tokens, type Streaming } from "./src/measure";
import { BENCH_DIR, loadScreens } from "./src/screens";
import type { ScreenSet } from "./src/tree";

export const FORMATS: readonly Format[] = [OMNI, OPENUI, A2UI_BATCHED, A2UI_STREAMED, JSON_RENDER, HTML, JSX];

/** OpenUI's published token counts (benchmarks/README.md at the pinned commit), for comparison. */
const OPENUI_PUBLISHED: Record<string, { openui: number; c1: number; jsonRender: number; yaml: number }> = {
  "simple-table": { openui: 148, yaml: 316, jsonRender: 340, c1: 357 },
  "chart-with-data": { openui: 231, yaml: 464, jsonRender: 520, c1: 516 },
  "contact-form": { openui: 294, yaml: 762, jsonRender: 893, c1: 849 },
  dashboard: { openui: 1226, yaml: 2128, jsonRender: 2247, c1: 2261 },
  "pricing-page": { openui: 1195, yaml: 2230, jsonRender: 2487, c1: 2379 },
  "settings-panel": { openui: 540, yaml: 1077, jsonRender: 1244, c1: 1205 },
  "e-commerce-product": { openui: 1166, yaml: 2145, jsonRender: 2449, c1: 2381 },
};

export interface ScreenResult {
  name: string;
  set: ScreenSet;
  components: number;
  /** Components with no counterpart in the other library (benchmarks/capabilities.ts). */
  noCounterpart: string[];
  /** Tokens per format id. */
  tokens: Record<string, number>;
  chars: Record<string, number>;
  streaming: Record<string, Streaming>;
  /** The screen as its author wrote it (a model for "omni", OpenUI for "openui"). */
  original: { format: string; tokens: number; chars: number };
  /** OpenUI's set: their own files and published counts, to check this converter against. */
  openuiFiles?: { jsonRender: number; c1: number; yaml: number; published: (typeof OPENUI_PUBLISHED)[string]; jsonRenderReproduced: number };
}

export interface Results {
  tokenizer: string;
  formats: { id: string; label: string; ext: string; sets: ScreenSet[] }[];
  screens: ScreenResult[];
  totals: Record<ScreenSet, Record<string, number>>;
}

export function run(): { results: Results; files: Map<string, string> } {
  const files = new Map<string, string>();
  const screens: ScreenResult[] = [];
  for (const { screen, original } of loadScreens()) {
    const r: ScreenResult = {
      name: screen.name,
      set: screen.set,
      components: screen.stmts.filter((s) => s.kind === "node").length,
      noCounterpart: [...new Set(screen.stmts.flatMap((s) => (s.kind === "node" && NO_COUNTERPART[screen.set].includes(s.type) ? [s.type] : [])))],
      tokens: {},
      chars: {},
      streaming: {},
      original: { format: screen.set === "omni" ? OMNI.id : OPENUI.id, tokens: tokens(original), chars: original.length },
    };
    for (const f of FORMATS) {
      if (f.sets && !f.sets.includes(screen.set)) continue;
      const out = f.emit(screen);
      files.set(`out/${screen.set}/${screen.name}.${f.ext}`, out.text);
      r.tokens[f.id] = tokens(out.text);
      r.chars[f.id] = out.text.length;
      r.streaming[f.id] = streaming(screen, out);
    }
    if (screen.set === "openui") {
      const read = (ext: string) => readFileSync(join(BENCH_DIR, "sources/openui/samples", `${screen.name}.${ext}`), "utf8");
      r.openuiFiles = {
        jsonRender: tokens(read("vercel.jsonl")),
        c1: tokens(read("c1.json")),
        yaml: tokens(read("yaml")),
        published: OPENUI_PUBLISHED[screen.name] as (typeof OPENUI_PUBLISHED)[string],
        jsonRenderReproduced: tokens(jsonRenderOpenUIStyle(screen)),
      };
    }
    screens.push(r);
  }
  freeEncoder();
  const totals = { omni: {}, openui: {} } as Results["totals"];
  for (const r of screens) for (const [f, n] of Object.entries(r.tokens)) totals[r.set][f] = (totals[r.set][f] ?? 0) + n;
  const results: Results = {
    tokenizer: 'tiktoken 1.x, encoding_for_model("gpt-5") (o200k_base), as in OpenUI\'s benchmark',
    formats: FORMATS.map((f) => ({ id: f.id, label: f.label, ext: f.ext, sets: [...(f.sets ?? ["omni", "openui"])] })),
    screens,
    totals,
  };
  files.set("results.json", JSON.stringify(results, null, 2) + "\n");
  // docs/COMPARISON.md's tables are generated from the results.
  const doc = join(BENCH_DIR, "../docs/COMPARISON.md");
  if (existsSync(doc)) files.set("../docs/COMPARISON.md", fillSections(readFileSync(doc, "utf8"), renderSections(results)));
  return { results, files };
}

function summary(results: Results): string {
  const lines: string[] = [];
  for (const set of ["omni", "openui"] as const) {
    const t = results.totals[set];
    const base = t[OMNI.id] as number;
    lines.push(`${set === "omni" ? "Model-check screens (9)" : "OpenUI's scenarios (7)"}: tokens, and size relative to Omni-IR`);
    for (const f of results.formats) if (t[f.id] !== undefined) lines.push(`  ${f.label.padEnd(40)} ${String(t[f.id]).padStart(6)}  ${round((t[f.id] as number) / base, 2)}×`);
  }
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.includes("--check");
  const { results, files } = run();
  const stale: string[] = [];
  for (const [rel, text] of files) {
    const path = join(BENCH_DIR, rel);
    const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (current === text) continue;
    if (check) stale.push(rel);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  if (check) {
    if (stale.length) {
      console.error(`benchmarks out of date (run npm run bench):\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log(`benchmarks up to date (${files.size} files)`);
  } else {
    console.log(summary(results));
    console.log(`\nwrote ${files.size} files under ${relative(process.cwd(), BENCH_DIR) || "."}`);
  }
}
