// npx tsx scripts/showcase.ts --json <out.json>   (the site build: the showcase entries as JSON)
//
// Reads site/landing/showcase/apps.json (PLAN-SHOWCASE.md), checks every entry and returns it ready for
// the page: each stream is read from its file (or written in the entry), parsed with the real parser and
// the demo app's registries, and must be clean; which catalog parts and app components it uses is read
// from the stream, never written by hand; every screenshot must exist, and all of them together must fit
// the image budget. Any problem stops the site build.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPONENT_TYPES, createParser, type ParserEvent } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";

export const PLATFORMS = { web: "Web", ios: "iPhone", android: "Android", chat: "Inside an AI chat" } as const;
export type Platform = keyof typeof PLATFORMS;

/** All the page's screenshots together, in bytes (PLAN-SHOWCASE.md, decision 4). */
export const IMAGE_BUDGET_BYTES = 1.5 * 1024 * 1024;
/** Where the screenshots live: served at showcase/ beside the page. */
export const SHOTS_DIR = "site/landing/public/showcase";

interface AppEntry {
  id: string;
  name: string;
  summary: string;
  platforms: Platform[];
  screen: string;
  stream?: string;
  lines?: string[];
  example?: string;
  features: string[];
  shots: Partial<Record<Platform, string>>;
  link?: { label: string; href: string };
  source: string;
}

export interface ShowcaseApp extends Omit<AppEntry, "stream" | "lines" | "example"> {
  /** The stream's lines, comments dropped. */
  lines: string[];
  catalog: string[];
  components: string[];
}

const fail = (id: string, message: string): never => {
  throw new Error(`showcase: ${id}: ${message}`);
};

export function loadShowcase(projectDir: string): ShowcaseApp[] {
  const { apps } = JSON.parse(readFileSync(join(projectDir, "site/landing/showcase/apps.json"), "utf8")) as { apps: AppEntry[] };
  const ids = new Set<string>();
  let imageBytes = 0;
  const out = apps.map((app) => {
    const id = app.id || fail("?", "every entry needs an id");
    if (ids.has(id)) fail(id, "the id is used twice");
    ids.add(id);
    for (const key of ["name", "summary", "screen", "source"] as const) if (!app[key]?.trim()) fail(id, `${key} is empty`);
    if (!app.platforms.length) fail(id, "no platforms");
    for (const p of app.platforms) {
      if (!(p in PLATFORMS)) fail(id, `unknown platform "${p}"`);
      const shot = app.shots[p] ?? fail(id, `no screenshot for ${p}`);
      const file = join(projectDir, SHOTS_DIR, shot);
      if (!existsSync(file)) fail(id, `screenshot ${shot} is missing (npm run showcase:shots)`);
      imageBytes += statSync(file).size;
    }
    for (const p of Object.keys(app.shots)) if (!app.platforms.includes(p as Platform)) fail(id, `a screenshot for ${p}, which isn't one of its platforms`);
    if (!app.features.length) fail(id, "say at least one thing it shows off");

    if (!!app.stream === !!app.lines) fail(id, "give either a stream file or its lines");
    const text = app.stream ? readFileSync(join(projectDir, app.stream), "utf8") : app.lines!.join("\n");
    const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
    // Lines written in the entry must be the ones its example really streams.
    if (app.example) {
      const example = readFileSync(join(projectDir, app.example), "utf8");
      for (const line of lines) if (!example.includes(line)) fail(id, `${app.example} doesn't stream ${line}`);
    }
    const problems: string[] = [];
    const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    parser.subscribe((e: ParserEvent) => {
      if (e.type === "error" || e.type === "warning") problems.push(`line ${e.issue.line ?? "?"}: ${e.issue.code}: ${e.issue.message}`);
    });
    parser.write(lines.join("\n") + "\n");
    parser.end();
    if (problems.length) fail(id, `the stream is not clean Omni-IR:\n  ${problems.join("\n  ")}`);

    const used = new Set(lines.map((l) => /^\$?\w+ = ([A-Z]\w*)\(/.exec(l)?.[1]).filter((t): t is string => !!t));
    const catalog = COMPONENT_TYPES.filter((t) => used.has(t));
    const components = Object.keys(APP_COMPONENTS).filter((t) => used.has(t));
    const { stream: _s, lines: _l, example: _e, ...rest } = app;
    return { ...rest, lines, catalog, components };
  });
  if (imageBytes > IMAGE_BUDGET_BYTES) {
    throw new Error(`showcase: the screenshots are ${Math.round(imageBytes / 1024)} KB, over the ${IMAGE_BUDGET_BYTES / 1024} KB budget`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const at = process.argv.indexOf("--json");
  const target = at > 0 ? process.argv[at + 1] : undefined;
  if (!target) throw new Error("usage: tsx scripts/showcase.ts --json <out.json>");
  const apps = loadShowcase(resolve("."));
  mkdirSync(dirname(resolve(target)), { recursive: true });
  writeFileSync(resolve(target), JSON.stringify(apps));
  console.log(`wrote ${target}: ${apps.length} apps`);
}
