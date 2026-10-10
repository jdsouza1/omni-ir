// The React renderer's tests, run again with React replaced by Preact (PLAN-ELEMENTS.md, decision 1):
// <omni-screen> draws with the same renderer on Preact, so they must behave the same. `npm run test:preact`.
import { defineConfig } from "vitest/config";
import { WORKSPACE_ALIASES } from "./scripts/workspace-aliases.ts";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PREACT_ALIASES } from "./scripts/preact-aliases.ts";

// The testing library's ES module build, so its own React imports go through the aliases too.
const testingLibrary = join(dirname(createRequire(import.meta.url).resolve("@testing-library/react/package.json")), "dist/@testing-library/react.esm.js");

export default defineConfig({
  resolve: { alias: [{ find: /^@testing-library\/react$/, replacement: testingLibrary }, ...PREACT_ALIASES, ...WORKSPACE_ALIASES] },
  test: {
    globals: true,
    // The catalog's stylesheet is real CSS in tests, so <omni-screen> carries its styles (omni.css?inline).
    css: { include: [/omni\.css/] },
    environment: "jsdom",
    // Every test of the catalog and the renderer; not the playground's, the site's or the MCP view's.
    include: ["tests/*.test.tsx"],
    exclude: ["tests/playground*.test.tsx", "tests/e2e.*.test.tsx", "tests/mcp*.test.tsx", "tests/perf.test.tsx", "tests/site.test.tsx", "tests/sourceView.test.tsx"],
    // The testing library imports React itself: inline it so it gets Preact too.
    server: { deps: { inline: [/@testing-library/] } },
  },
});
