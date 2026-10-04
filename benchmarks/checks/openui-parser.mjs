// Manual check: parse every generated OpenUI Lang file with OpenUI's own parser.
// Not part of `npm test`: @openuidev/lang-core runs a postinstall script that sends install
// telemetry, so it is not a dependency of this repo. Install it on its own, without scripts:
//
//   mkdir oui-check && cd oui-check && npm init -y
//   DO_NOT_TRACK=1 npm install --ignore-scripts @openuidev/lang-core@0.3.0
//   cp <repo>/benchmarks/checks/openui-parser.mjs . && node openui-parser.mjs <repo>
//
// Result on 2026-10-01: all 16 files parse with no errors, unresolved or orphaned statements.
import { createParser } from "@openuidev/lang-core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const repo = process.argv[2];
const omniSchema = JSON.parse(readFileSync(join(repo, "conformance/schema.json"), "utf8"));
// Omni-IR's catalog as an OpenUI library: same props, same order, same required props.
const omniLib = { $defs: Object.fromEntries(Object.entries(omniSchema.components).map(([name, c]) => [name, { type: "object", properties: Object.fromEntries(Object.keys(c.props.properties).map((k) => [k, {}])), required: c.props.required ?? [] }])) };
const openuiLib = JSON.parse(readFileSync(join(repo, "benchmarks/sources/openui/schema.json"), "utf8"));
let bad = 0;
for (const [set, lib] of [["omni", omniLib], ["openui", openuiLib]]) {
  const dir = join(repo, "benchmarks/out", set);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".oui"))) {
    const text = readFileSync(join(dir, f), "utf8");
    const r = createParser(lib, "Root").parse(text);
    const statements = text.trim().split("\n").length;
    const problems = [];
    if (!r.root) problems.push("no root");
    if (r.meta.incomplete) problems.push("incomplete");
    if (r.meta.unresolved.length) problems.push("unresolved " + r.meta.unresolved);
    if (r.meta.orphaned.length) problems.push("orphaned " + r.meta.orphaned);
    if (r.meta.errors.length) problems.push("errors " + JSON.stringify(r.meta.errors).slice(0, 300));
    if (r.meta.statementCount !== statements) problems.push(`statements ${r.meta.statementCount}/${statements}`);
    const muts = (text.match(/= Mutation\(/g) || []).length;
    if (r.mutationStatements.length !== muts) problems.push(`mutations ${r.mutationStatements.length}/${muts}`);
    const vars = (text.match(/^\$\w+ =/gm) || []).length;
    if (Object.keys(r.stateDeclarations).length !== vars) problems.push(`state ${Object.keys(r.stateDeclarations).length}/${vars}`);
    if (problems.length) bad++;
    console.log(`${set}/${f}: ${problems.length ? problems.join("; ") : "ok"} (root ${r.root?.typeName}, ${r.meta.statementCount} statements, ${r.mutationStatements.length} mutations)`);
  }
}
process.exit(bad ? 1 : 0);
