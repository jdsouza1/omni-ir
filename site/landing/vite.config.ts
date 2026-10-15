// The landing page, built into the root of the site (dist/site). Its example tabs come from
// fixtures/landing, checked with the real parser by `npm run landing:build` before Vite runs
// (scripts/landing-examples.ts --json), so a broken example fails the build.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { WORKSPACE_ALIASES } from "../../scripts/workspace-aliases.ts";

export const EXAMPLES_JSON = "dist/landing-examples.json";
export const SHOWCASE_JSON = "dist/showcase.json";

export default defineConfig({
  root: resolve("site/landing"),
  base: "./",
  resolve: { alias: WORKSPACE_ALIASES },
  define: { __LANDING_TABS__: readFileSync(resolve(EXAMPLES_JSON), "utf8"), __SHOWCASE__: readFileSync(resolve(SHOWCASE_JSON), "utf8") },
  // Three pages: the landing page, the comparison page (PLAN-COMPARE-PAGE.md) at compare/ and the
  // showcase (PLAN-SHOWCASE.md) at showcase/, whose entries scripts/showcase.ts checks first.
  build: {
    outDir: resolve("dist/site"),
    emptyOutDir: false,
    rollupOptions: { input: { main: resolve("site/landing/index.html"), compare: resolve("site/landing/compare/index.html"), showcase: resolve("site/landing/showcase/index.html") } },
  },
});
