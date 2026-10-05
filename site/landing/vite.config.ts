// The landing page, built into the root of the site (dist/site). Its example tabs come from
// fixtures/landing and are checked with the real parser here, so a broken example fails the build.
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { loadLandingTabs } from "../../scripts/landing-examples.ts";
import { WORKSPACE_ALIASES } from "../../scripts/workspace-aliases.ts";

export default defineConfig({
  root: resolve("site/landing"),
  base: "./",
  resolve: { alias: WORKSPACE_ALIASES },
  define: { __LANDING_TABS__: JSON.stringify(loadLandingTabs(resolve("."))) },
  build: { outDir: resolve("dist/site"), emptyOutDir: false },
});
