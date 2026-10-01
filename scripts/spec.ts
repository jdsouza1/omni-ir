// npm run spec            regenerate the generated sections of SPEC.md
// npm run spec -- --check exit 1 if SPEC.md is out of date (used by the tests)
//
// Generated sections sit between <!-- generated:NAME --> and <!-- /generated:NAME --> markers.
// Everything outside the markers is hand-written and never touched.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { describeComponent } from "@omni-ir/core";
import { createParser } from "@omni-ir/core";
import { COMPONENT_TYPES, LIMITS } from "@omni-ir/core";
import { ISSUE_CODES } from "@omni-ir/core";

const LIMIT_LABELS: Record<keyof typeof LIMITS, string> = {
  lineLength: "Characters in one line (UTF-16 code units, excluding the line ending)",
  text: "Characters in one text value",
  children: "Ids in one children list",
  idLength: "Characters in a component id",
  stateKeyLength: "Characters in a $state key, including the $",
  toolNameLength: "Characters in a tool name",
  actionNameLength: "Characters in a Button action name",
};

const STAGE_LABEL = { line: "when the line arrives", end: "at end of stream", renderer: "in the renderer" } as const;

const EXAMPLES: { title: string; file: string; note: string }[] = [
  { title: "Payment confirmation", file: "payment-confirmation.omni", note: "Root first, state, an Input, a governed Pay button and a local Cancel button." },
  { title: "Sign-in by emailed link", file: "sign-in.omni", note: "A form whose typed value is sent through McpMutation params." },
  { title: "A stream with errors", file: "variants/missing-mutation.omni", note: "The Pay button has an action but no McpMutation." },
];

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function renderSections(projectDir = "."): Record<string, string> {
  const components = COMPONENT_TYPES.map((type) => {
    const shape = describeComponent(type);
    const rows = shape.props.map(
      (p) =>
        `| \`${p.name}\` | ${p.position === null ? "named only" : `${p.position + 1}`} | ${p.required ? "yes" : "no"} | ${cell(p.detail)} |`,
    );
    return [
      `### ${type}`,
      "",
      "```",
      shape.signature,
      "```",
      "",
      rows.length ? ["| Prop | Position | Required | Values |", "|---|---|---|---|", ...rows].join("\n") : "No props.",
    ].join("\n");
  }).join("\n\n");

  const issues = [
    "| Code | Severity | Found | Meaning |",
    "|---|---|---|---|",
    ...Object.entries(ISSUE_CODES).map(
      ([code, info]) => `| \`${code}\` | ${info.severity} | ${STAGE_LABEL[info.stage]} | ${cell(info.meaning)} |`,
    ),
  ].join("\n");

  const limits = [
    "| Limit | Maximum |",
    "|---|---|",
    ...Object.entries(LIMITS).map(([key, value]) => `| ${LIMIT_LABELS[key as keyof typeof LIMITS]} | ${value.toLocaleString("en-US")} |`),
  ].join("\n");

  const examples = EXAMPLES.map(({ title, file, note }) => {
    const source = readFileSync(join(projectDir, "fixtures", file), "utf8")
      .split("\n")
      .filter((l) => !l.startsWith("#"))
      .join("\n")
      .trim();
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    const found: string[] = [];
    parser.subscribe((e) => {
      if (e.type === "error" || e.type === "warning") found.push(`- line ${e.issue.line ?? "(none)"}: \`${e.issue.code}\` (${e.issue.message})`);
    });
    parser.write(source + "\n");
    parser.end();
    return [
      `### ${title}`,
      "",
      note,
      "",
      "```",
      source,
      "```",
      "",
      found.length ? `Issues reported:\n\n${found.join("\n")}` : "No issues.",
    ].join("\n");
  }).join("\n\n");

  return { components, issues, limits, examples };
}

/** Replace the content of each generated section. Unknown or missing markers are errors. */
export function applySections(doc: string, sections: Record<string, string>): string {
  const seen = new Set<string>();
  const out = doc.replace(
    /<!-- generated:([a-z-]+) -->\n[\s\S]*?<!-- \/generated:\1 -->/g,
    (_match, name: string) => {
      if (!(name in sections)) throw new Error(`SPEC.md has an unknown generated section: ${name}`);
      seen.add(name);
      return `<!-- generated:${name} -->\n${sections[name]}\n<!-- /generated:${name} -->`;
    },
  );
  for (const name of Object.keys(sections)) {
    if (!seen.has(name)) throw new Error(`SPEC.md is missing the markers for generated section: ${name}`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const path = resolve("SPEC.md");
  const current = readFileSync(path, "utf8");
  const next = applySections(current, renderSections());
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error("SPEC.md is out of date. Run: npm run spec");
      process.exit(1);
    }
    console.log("SPEC.md is up to date.");
  } else {
    writeFileSync(path, next);
    console.log(next === current ? "SPEC.md was already up to date." : "SPEC.md updated.");
  }
}
