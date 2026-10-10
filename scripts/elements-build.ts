// npm run elements:build: bundles <omni-screen> (packages/elements, Step 21) into one ES module,
// packages/elements/dist/omni-elements.js, with the parser, the React renderer on Preact (decision 1)
// and the catalog's styles inside, nothing loaded from elsewhere. Also copies the hand-written types.
// The site serves the same file for a plain <script type="module"> (npm run site:build).
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Rolldown } from "vite";
import { PREACT_ALIASES } from "./preact-aliases.ts";
import { WORKSPACE_ALIASES } from "./workspace-aliases.ts";

export const ELEMENTS_OUT = resolve("packages/elements/dist/omni-elements.js");
/** Decision 8: the compressed size the element must stay within. */
export const ELEMENTS_BUDGET_BYTES = 140 * 1024;

export async function buildElements(): Promise<string> {
  const result = (await build({
    configFile: false,
    logLevel: "warn",
    resolve: { alias: [...PREACT_ALIASES, ...WORKSPACE_ALIASES] },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      lib: { entry: resolve("packages/elements/src/index.ts"), formats: ["es"], fileName: () => "omni-elements.js" },
    },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
  const output = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = output.filter((o) => o.type === "chunk");
  if (chunks.length !== 1) throw new Error(`elements:build: expected one module, got ${chunks.length}`);
  return `/*! @omni-ir/elements · Apache-2.0 · includes Preact (MIT) and Zod (MIT) */\n${chunks[0]!.code}`;
}

export function gzipSize(code: string): number {
  return gzipSync(code).length;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/elements-build.ts")) {
  const code = await buildElements();
  mkdirSync(dirname(ELEMENTS_OUT), { recursive: true });
  writeFileSync(ELEMENTS_OUT, code);
  copyFileSync(resolve("packages/elements/src/omni-elements.d.ts"), resolve("packages/elements/dist/omni-elements.d.ts"));
  const size = gzipSize(code);
  console.log(`wrote ${ELEMENTS_OUT}: ${Math.round(code.length / 1024)} KB, ${Math.round(size / 1024)} KB compressed (budget ${ELEMENTS_BUDGET_BYTES / 1024} KB)`);
  if (size > ELEMENTS_BUDGET_BYTES) {
    console.error("elements:build: over the size budget (PLAN-ELEMENTS.md, decision 8)");
    process.exit(1);
  }
}
