// npm run mcp:host: builds the MCP Apps demo host into dist/mcp-host, a local stand-in for Claude or
// ChatGPT that streams sample screens into the bridge's view (with the demo tools and pictures) through
// the official host bridge. Serve the folder over HTTP to try it, e.g. `python -m http.server 8767
// --directory dist/mcp-host`. For screenshots and trying the view without a host; no model, no network.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";
import { injectConfig, viewConfig } from "@omni-ir/mcp";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { buildView } from "./mcp-view";
import { WORKSPACE_ALIASES } from "./workspace-aliases.ts";

const out = resolve("dist/mcp-host");
await build({
  configFile: false,
  logLevel: "warn",
  root: resolve("scripts/mcp-host"),
  base: "./",
  resolve: { alias: WORKSPACE_ALIASES },
  build: { outDir: out, emptyOutDir: true, target: "es2022" },
});
writeFileSync(resolve(out, "view.html"), injectConfig(await buildView(), viewConfig({ tools: TOOLS, assets: ASSETS })));
console.log(`built ${out}`);
