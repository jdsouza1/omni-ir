// Fails the build if any source file uses a raw-HTML or dynamic-code escape hatch.
// The Trusted Catalog must never turn stream content into markup or code (CLAUDE.md constraint 1).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["app", "engine", "catalog", "renderer", "server", "client", "playground"];
const BANNED = [
  { name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/ },
  { name: "innerHTML", re: /\binnerHTML\b/ },
  { name: "outerHTML", re: /\bouterHTML\b/ },
  { name: "eval", re: /\beval\s*\(/ },
  { name: "new Function", re: /\bnew\s+Function\s*\(/ },
];
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.test(entry)) yield path;
  }
}

const violations = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const { name, re } of BANNED) {
          if (re.test(line)) violations.push(`${relative(".", file)}:${i + 1}  ${name}`);
        }
      });
  }
}

if (violations.length) {
  console.error("guard: banned API usage found:\n  " + violations.join("\n  "));
  process.exit(1);
}
console.log(`guard: ok (${ROOTS.join(", ")})`);
