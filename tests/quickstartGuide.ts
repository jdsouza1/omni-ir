// The developer guide's code (site/docs/guide/getting-started.md, PLAN-QUICKSTART.md A.5), written to
// files exactly as a reader would copy it, so the tests run what the guide shows.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const GUIDE = "site/docs/guide/getting-started.md";

/** Each step's code blocks that start with a `// path` line, by step number. */
export function guideFiles(): Map<number, Map<string, string>> {
  const steps = new Map<number, Map<string, string>>();
  let step = 0;
  const text = readFileSync(GUIDE, "utf8");
  for (const part of text.split(/^(## \d+\. .*|```tsx?\n[\s\S]*?\n```)$/m)) {
    const heading = /^## (\d+)\. /.exec(part);
    if (heading) step = Number(heading[1]);
    const block = /^```tsx?\n\/\/ ([\w./]+)\n([\s\S]*?)\n```$/.exec(part);
    if (block && step > 0) {
      if (!steps.has(step)) steps.set(step, new Map());
      steps.get(step)!.set(block[1]!, `// ${block[1]}\n${block[2]}\n`);
    }
  }
  return steps;
}

/** The guide's one-line snippets with no file name (step 5's renderer line). */
export function guideSnippet(step: number): string {
  const text = readFileSync(GUIDE, "utf8");
  const section = text.split(/^## /m).find((s) => s.startsWith(`${step}. `))!;
  return [...section.matchAll(/^```tsx\n(<[^\n]*>)\n```$/gm)].map((m) => m[1]!)[0]!;
}

/**
 * The app as it stands after `step`: every file the guide has shown so far, latest version first.
 * `edit` changes a file the way the guide's prose says to (for example step 5's renderer line).
 */
export function writeApp(name: string, step: number, edit: (path: string, text: string) => string = (_p, t) => t): string {
  const dir = resolve("tests/.quickstart", name);
  rmSync(dir, { recursive: true, force: true });
  const files = new Map<string, string>();
  for (const [n, blocks] of [...guideFiles()].sort(([a], [b]) => a - b)) if (n <= step) for (const [path, text] of blocks) files.set(path, text);
  for (const [path, text] of files) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, edit(path, text));
  }
  return dir;
}
