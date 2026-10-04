// The two screen sets: the nine replies from the first model check (written by a model in
// Omni-IR), and the seven scenarios OpenUI publishes in its benchmark (written in OpenUI Lang).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OMNI_CATALOG, OPENUI_CATALOG } from "./catalogs";
import { parseOmni, parseOpenUILang } from "./parse";
import type { Screen } from "./tree";

export const BENCH_DIR = join(import.meta.dirname, "..");

/** Order of the model check (docs/model-check-2026-10-01.md). */
export const OMNI_SCREENS = ["booking", "bag", "assistant", "sign-in", "order", "support", "outside-catalog", "styling", "no-tool"] as const;
/** Order of OpenUI's benchmark table. */
export const OPENUI_SCREENS = ["simple-table", "chart-with-data", "contact-form", "dashboard", "pricing-page", "settings-panel", "e-commerce-product"] as const;

export interface Source {
  screen: Screen;
  /** The text as its author wrote it. */
  original: string;
}

export function loadScreens(): Source[] {
  const omni = OMNI_SCREENS.map((name) => {
    const original = readFileSync(join(BENCH_DIR, "screens/omni", `${name}.omni`), "utf8");
    return { screen: parseOmni(name, "omni", OMNI_CATALOG, original), original };
  });
  const openui = OPENUI_SCREENS.map((name) => {
    const original = readFileSync(join(BENCH_DIR, "sources/openui/samples", `${name}.oui`), "utf8");
    return { screen: parseOpenUILang(name, "openui", OPENUI_CATALOG, original), original };
  });
  const omniFiles = readdirSync(join(BENCH_DIR, "screens/omni")).filter((f) => f.endsWith(".omni")).length;
  if (omniFiles !== OMNI_SCREENS.length) throw new Error("screens/omni has files not listed in OMNI_SCREENS");
  return [...omni, ...openui];
}
