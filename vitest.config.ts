import { defineConfig } from "vitest/config";
import { WORKSPACE_ALIASES } from "./scripts/workspace-aliases.ts";

export default defineConfig({
  resolve: { alias: WORKSPACE_ALIASES },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Component and end-to-end tests opt into a DOM with `// @vitest-environment jsdom`.
  },
});
