// npm run mcp:view [-- out.html]
// Bundles the MCP Apps bridge's view (packages/mcp/src/view) into one HTML file: React, the parser,
// the Trusted Catalog and its CSS inline, nothing loaded from the network ([10.25]). The server
// injects the app's tools and pictures where `<!--omni-ir-config-->` stands. Writes
// packages/mcp/dist/view.html by default, which the published package serves.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { WORKSPACE_ALIASES } from "./workspace-aliases.ts";

const VIEW_DIR = resolve("packages/mcp/src/view");
export const VIEW_OUT = resolve("packages/mcp/dist/view.html");

/** Inline text can't end its own element or open a comment that hides the rest. */
const escapeInline = (s: string, tag: "script" | "style") => s.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1").replace(/<!--/g, "<\\!--");

export async function buildView(): Promise<string> {
  const result = (await build({
    configFile: false,
    logLevel: "warn",
    resolve: { alias: WORKSPACE_ALIASES },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: true,
      cssCodeSplit: false,
      lib: { entry: resolve(VIEW_DIR, "main.tsx"), formats: ["iife"], name: "OmniMcpView", fileName: () => "view.js" },
    },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[];
  const output = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const js = output.find((o) => o.type === "chunk")?.code ?? "";
  const cssAsset = output.find((o) => o.type === "asset" && o.fileName.endsWith(".css"));
  const css = cssAsset && cssAsset.type === "asset" ? String(cssAsset.source) : "";
  if (!js || !css) throw new Error("mcp:view: the bundle is missing its script or styles");
  const template = readFileSync(resolve(VIEW_DIR, "index.html"), "utf8");
  return template
    .replace("</head>", () => `<style>${escapeInline(css, "style")}</style>\n  </head>`)
    .replace("</body>", () => `<script>${escapeInline(js, "script")}</script>\n  </body>`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? VIEW_OUT);
  const html = await buildView();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
}
