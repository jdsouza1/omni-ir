// npm run landing:examples -- <landing-page.html> <out.html>
//
// Regenerates the landing page's example tabs (the EXAMPLES data in its script) from
// fixtures/landing/*.omni and fixtures/landing/landing.json, so the page always shows real Omni-IR.
// Every example is parsed with the real parser first; any error stops the script.
//
// Workflow (costs nothing):
//   1. Read the current page with the Artifact tool (action "read"); it saves the HTML to a local file.
//   2. npm run landing:examples -- <that file> landing.html
//   3. Publish landing.html to the same artifact URL.
// The card mock-ups on the page are hand-made HTML. If you add or rename a card part, add a matching
// element with box-shadow `{{ r_<part> }}` to the page; the script refuses parts the page lacks.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser, type ParserEvent } from "@omni-ir/core";

export interface LandingLine {
  kw: string;
  name: string;
  rest: string;
  part: string;
  explain: string;
}
export interface LandingTab {
  key: string;
  label: string;
  lines: LandingLine[];
}

interface LandingConfig {
  tabs: { key: string; label: string; file: string; lines: { part: string; explain: string }[] }[];
}

const TEMPLATE_OPEN = '<script type="__bundler/template">';
const BACKSLASH = String.fromCharCode(92);

/** Split a bundled page into its template and a function that puts an edited template back. */
export function openBundle(html: string): { template: string; rebuild: (template: string) => string } {
  const start = html.indexOf(TEMPLATE_OPEN);
  if (start < 0) throw new Error("not a bundled page: no template script found");
  const from = start + TEMPLATE_OPEN.length;
  const to = html.indexOf("</script>", from);
  const raw = html.slice(from, to);
  const template = JSON.parse(raw) as string;
  // The bundle stores "</" as "</" so the template can't close its own <script> tag.
  const encode = (t: string) => JSON.stringify(t).split("</").join("<" + BACKSLASH + "u002F");
  if (encode(template) !== raw.trim()) throw new Error("the page's template does not round-trip; refusing to edit it");
  return { template, rebuild: (t) => html.slice(0, from) + "\n" + encode(t) + "\n  " + html.slice(to) };
}

/** Read the fixtures and explanations, checking every example with the real parser. */
export function loadLandingTabs(projectDir: string): LandingTab[] {
  const dir = join(projectDir, "fixtures", "landing");
  const config = JSON.parse(readFileSync(join(dir, "landing.json"), "utf8")) as LandingConfig;
  return config.tabs.map((tab) => {
    const source = readFileSync(join(dir, tab.file), "utf8");
    const problems: string[] = [];
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    parser.subscribe((e: ParserEvent) => {
      if (e.type === "error" || e.type === "warning") problems.push(`line ${e.issue.line ?? "?"}: ${e.issue.code}: ${e.issue.message}`);
    });
    parser.write(source);
    parser.end();
    if (problems.length) throw new Error(`${tab.file} is not clean Omni-IR:\n  ${problems.join("\n  ")}`);

    const lines = source.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
    if (lines.length !== tab.lines.length) {
      throw new Error(`${tab.file} has ${lines.length} lines but landing.json explains ${tab.lines.length}`);
    }
    return {
      key: tab.key,
      label: tab.label,
      lines: lines.map((line, i) => {
        const m = /^(\$?[A-Za-z_]\w*) = ([A-Z]\w*)?(.*)$/.exec(line);
        if (!m) throw new Error(`${tab.file}: cannot split line ${i + 1}: ${line}`);
        return { kw: m[1]!, name: m[2] ?? "", rest: m[3]!, ...tab.lines[i]! };
      }),
    };
  });
}

/** Replace the page's EXAMPLES data (and PARTS list) with the given tabs. */
export function replaceExamples(template: string, tabs: LandingTab[]): string {
  const parts = [...new Set(tabs.flatMap((t) => t.lines.map((l) => l.part)))];
  for (const part of parts) {
    if (part !== "root" && !template.includes(`{{ r_${part} }}`)) {
      throw new Error(`the page has no element for card part "${part}" (expected box-shadow {{ r_${part} }})`);
    }
  }
  const js = (v: unknown) => JSON.stringify(v);
  const block =
    "// Generated from the repo's fixtures/landing/*.omni (validated by the Omni-IR parser).\nconst EXAMPLES = {\n" +
    tabs
      .map(
        (t) =>
          `  ${t.key}: { label: ${js(t.label)}, lines: [\n` +
          t.lines
            .map((l) => `    { kw: ${js(l.kw)}, name: ${js(l.name)}, rest: ${js(l.rest)}, part: ${js(l.part)}, explain: ${js(l.explain)} },`)
            .join("\n") +
          "\n  ]},",
      )
      .join("\n") +
    `\n};\nconst PARTS = ${js(parts)};`;

  const startMarker = template.includes("// Generated from the repo's fixtures") ? "// Generated from the repo's fixtures" : "const EXAMPLES = {";
  const start = template.indexOf(startMarker);
  const endMarker = template.includes("const PARTS = ") ? "const PARTS = " : null;
  if (start < 0 || endMarker === null) {
    throw new Error("the page's EXAMPLES block is not in the generated format; see the git history of this script for the first conversion");
  }
  const endLine = template.indexOf("\n", template.indexOf(endMarker, start));
  return template.slice(0, start) + block + template.slice(endLine);
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: npm run landing:examples -- <landing-page.html> <out.html>");
    process.exit(2);
  }
  const tabs = loadLandingTabs(resolve("."));
  const page = openBundle(readFileSync(input, "utf8"));
  writeFileSync(output, page.rebuild(replaceExamples(page.template, tabs)));
  console.log(`wrote ${output}: ${tabs.map((t) => `${t.label} (${t.lines.length} lines)`).join(", ")}`);
}
