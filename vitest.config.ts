import { defineConfig } from "vitest/config";
import { WORKSPACE_ALIASES } from "./scripts/workspace-aliases.ts";

export default defineConfig({
  resolve: { alias: WORKSPACE_ALIASES },
  test: {
    globals: true,
    // The catalog's stylesheet is real CSS in tests, so <omni-screen> carries its styles (omni.css?inline).
    css: { include: [/omni\.css/] },
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Runs only with Preact in place of React (npm run test:preact).
    exclude: ["tests/preact.sanity.test.tsx", "**/node_modules/**"],
    // Component and end-to-end tests opt into a DOM with `// @vitest-environment jsdom`.
  },
});
