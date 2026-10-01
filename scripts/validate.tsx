// npm run validate -- reply.omni [more.omni …]
// Checks Omni-IR text (e.g. a model's reply saved from a Claude.ai chat) exactly as the browser would:
// every parse error and warning with its line, the end-of-stream issues, then the rendered HTML.
// Exits with code 1 if any file has errors or issues. Costs nothing: it only reads local files.
import { readFileSync } from "node:fs";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser, type ParserEvent } from "@omni-ir/core";
import { bold, dim, green, red, renderHtml, yellow } from "./lib";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: npm run validate -- <file.omni> [more files]");
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const parser = createParser({ tools: TOOLS, assets: ASSETS });
  const errors: ParserEvent[] = [];
  const warnings: ParserEvent[] = [];
  parser.subscribe((e) => {
    if (e.type === "error") errors.push(e);
    if (e.type === "warning") warnings.push(e);
  });
  parser.write(source);
  parser.end();

  console.log(bold(`\n${file}`));
  for (const e of [...errors, ...warnings]) {
    if (e.type !== "error" && e.type !== "warning") continue;
    const tag = e.type === "error" ? red("error  ") : yellow("warning");
    const line = e.issue.line ? `line ${e.issue.line}: ` : "";
    console.log(`  ${tag} ${line}${e.issue.code}: ${e.issue.message}`);
  }
  if (/^```/m.test(source)) {
    console.log(dim("  hint: the text contains Markdown code fences (```); the prompt asks for Omni-IR lines only."));
  }

  const nodes = parser.getSnapshot().nodes.size;
  if (errors.length === 0) {
    console.log(green(`  ✓ no errors`) + (warnings.length ? yellow(` (${warnings.length} warning(s))`) : "") + dim(` · ${nodes} components`));
  } else {
    failed++;
    console.log(red(`  ✗ ${errors.length} error(s)`) + dim(` · ${nodes} components accepted`));
  }
  if (nodes > 0) console.log(dim(renderHtml(parser)));
}

console.log(bold(`\n${files.length - failed}/${files.length} file(s) valid`));
process.exit(failed > 0 ? 1 : 0);
