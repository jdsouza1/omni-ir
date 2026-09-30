import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Component and end-to-end tests opt into a DOM with `// @vitest-environment jsdom`.
  },
});
