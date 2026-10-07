// Vite and Vitest resolve the workspace packages to their TypeScript source, like tsconfig.json's
// `paths`, so the repo runs without building the packages first. Published builds come from
// `npm run build:packages`.
import { resolve } from "node:path";

export const WORKSPACE_ALIASES = [
  { find: /^@omni-ir\/core$/, replacement: resolve("packages/core/src/index.ts") },
  { find: /^@omni-ir\/core\/ag-ui$/, replacement: resolve("packages/core/src/agui.ts") },
  { find: /^@omni-ir\/react$/, replacement: resolve("packages/react/src/index.ts") },
  { find: /^@omni-ir\/react\/omni\.css$/, replacement: resolve("packages/react/src/catalog/omni.css") },
  { find: /^@omni-ir\/mcp$/, replacement: resolve("packages/mcp/src/index.ts") },
];
