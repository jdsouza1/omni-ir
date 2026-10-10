// Installs the packed packages into a fresh project, as a user would get them from npm, and checks
// they work there: render a screen with react-dom/server in plain Node, type-check the README
// example under both `nodenext` and `bundler` resolution, and bundle an app with Vite (including
// `@omni-ir/react/omni.css`). Needs network access for react, zod, vite and typescript from npm,
// all free. Run `npm run build:packages` first. `--keep` leaves the project for inspection.
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const keep = process.argv.includes("--keep");
const root = JSON.parse(readFileSync("package.json", "utf8"));
const dir = mkdtempSync(join(tmpdir(), "omni-ir-install-"));
const run = (cmd, cwd = dir) => execSync(cmd, { cwd, stdio: "inherit" });
const write = (file, text) => {
  mkdirSync(join(dir, file, ".."), { recursive: true });
  writeFileSync(join(dir, file), text);
};

try {
  const tarballs = {};
  for (const pkg of ["core", "react", "mcp", "elements"]) {
    const out = execSync(`npm pack --json --workspace packages/${pkg} --pack-destination "${dir}"`, { encoding: "utf8" });
    const [{ name, filename }] = JSON.parse(out);
    tarballs[name] = `file:./${filename}`;
  }

  write(
    "package.json",
    JSON.stringify(
      {
        name: "omni-ir-install-test",
        private: true,
        type: "module",
        dependencies: {
          ...tarballs,
          react: root.dependencies.react,
          "react-dom": root.dependencies["react-dom"],
          zod: root.dependencies.zod,
          // To check @omni-ir/mcp as an MCP host would: its client, and the server's in-memory transport.
          "@modelcontextprotocol/client": root.devDependencies["@modelcontextprotocol/client"],
          "@modelcontextprotocol/server": JSON.parse(readFileSync("packages/mcp/package.json", "utf8")).dependencies["@modelcontextprotocol/server"],
        },
        devDependencies: {
          "@types/react": root.devDependencies["@types/react"],
          "@types/react-dom": root.devDependencies["@types/react-dom"],
          "@types/node": root.devDependencies["@types/node"],
          typescript: "^5.9.0",
          vite: root.devDependencies.vite,
        },
      },
      null,
      2,
    ),
  );

  // The README example, plus an image from the asset registry.
  const SCREEN = String.raw`
const tools = {
  "payments.confirm": z.strictObject({ amount: z.number().positive() }),
};
const assets = { "cabin-pines": { src: "/img/cabin.jpg", width: 640, height: 400 } };
const parser = createParser({ tools, assets });
parser.write('root = Card([title, photo, pay])\ntitle = Heading("Confirm payment")\n');
parser.write('photo = Image("cabin-pines", alt="A cabin")\n');
parser.write('pay = Button("Pay $42.50", action="pay")\n');
parser.write('payM = McpMutation(pay, tool="payments.confirm", params={amount: 42.50})\n');
const issues = parser.end();
`;

  write(
    "render.mjs",
    `import { createParser, COMPONENT_TYPES } from "@omni-ir/core";
import { AgUiEncoder, createAgUiReader } from "@omni-ir/core/ag-ui";
import { OmniRenderer, DEFAULT_CATALOG } from "@omni-ir/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
${SCREEN}
const html = renderToString(createElement(OmniRenderer, { store: parser.store, tools, assets, onMutation: () => {} }));
const expect = (ok, what) => { if (!ok) { console.error("FAIL:", what, "\\n", html); process.exit(1); } };
expect(issues.length === 0, "no issues: " + JSON.stringify(issues));
expect(html.includes("Confirm payment"), "heading text");
expect(html.includes('data-node-id="root"'), "node ids");
expect(html.includes('src="/img/cabin.jpg"') && html.includes('alt="A cabin"'), "image from the registry");
expect(/<button[^>]*>Pay \\$42\\.50<\\/button>/.test(html), "governed button");
expect(COMPONENT_TYPES.every((t) => t in DEFAULT_CATALOG), "catalog covers every component");
// The AG-UI entry point: a screen through the encoder and the reader.
const encoder = new AgUiEncoder({ threadId: "t", runId: "r", messageId: "m" });
const viaAgUi = createParser({ tools, assets });
const reader = createAgUiReader(viaAgUi);
for (const event of [...encoder.start(), ...encoder.write('root = Heading("Over AG-UI")\\n'), ...encoder.finish()]) reader.feed(event);
expect(viaAgUi.getSnapshot().nodes.get("root")?.props.text === "Over AG-UI" && reader.outcome?.status === "done", "@omni-ir/core/ag-ui round trip");
console.log("render: ok (" + html.length + " chars of HTML)");
`,
  );

  write(
    "src/app.tsx",
    `import { createParser, type Issue } from "@omni-ir/core";
import { createAgUiReader, type AgUiReader } from "@omni-ir/core/ag-ui";
import { DEFAULT_CATALOG, OmniRenderer, createMutationHandler, generate, type Catalog, type MutationCall } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { z } from "zod";
${SCREEN}
const checked: Issue[] = issues;
const catalog: Catalog = { ...DEFAULT_CATALOG };
const onMutation: (call: MutationCall) => Promise<void> = createMutationHandler();
export const pending = generate("a payment confirmation", { parser });
export const reader: AgUiReader = createAgUiReader(createParser({ tools, assets }));
export function Screen() {
  return <OmniRenderer store={parser.store} tools={tools} assets={assets} catalog={catalog} onMutation={onMutation} />;
}
export { checked };
`,
  );
  // @omni-ir/mcp as a host sees it: the tools, the view with the app's pictures, a screen, an action,
  // and the npx server over stdio.
  write(
    "mcp.mjs",
    `import { createOmniMcpServer, SCREEN_TOOL, VIEW_URI } from "@omni-ir/mcp";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
const expect = (ok, what) => { if (!ok) { console.error("FAIL:", what); process.exit(1); } };
const server = createOmniMcpServer({
  tools: { "payments.confirm": z.strictObject({ amount: z.number().positive() }) },
  assets: { dot: { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", width: 1, height: 1 } },
  onAction: async ({ params }) => ({ ok: true, result: { paid: params.amount } }),
});
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a);
const client = new Client({ name: "install-test", version: "1" });
await client.connect(b);
const { tools } = await client.listTools();
expect(tools.some((t) => t.name === SCREEN_TOOL) && tools.some((t) => t.name === "payments.confirm"), "show_screen and the action tool");
const view = (await client.readResource({ uri: VIEW_URI })).contents[0];
expect(view.mimeType === "text/html;profile=mcp-app" && view.text.includes("omni-root") && view.text.includes('"dot"'), "the built view with the app's pictures");
const shown = await client.callTool({ name: SCREEN_TOOL, arguments: { screen: 'root = Heading("Hi")\\n' } });
expect(shown.structuredContent?.components === 1, "show_screen");
const paid = await client.callTool({ name: "payments.confirm", arguments: { amount: 5 } });
expect(paid.structuredContent?.paid === 5, "an action");
await client.close();
const stdio = new Client({ name: "install-test", version: "1" });
await stdio.connect(new StdioClientTransport({ command: process.execPath, args: ["node_modules/@omni-ir/mcp/dist/bin.js"] }));
expect((await stdio.listTools()).tools.map((t) => t.name).join() === SCREEN_TOOL, "npx @omni-ir/mcp over stdio");
await stdio.close();
console.log("mcp: ok");
`,
  );
  write(
    "src/mcp.ts",
    `import { createOmniMcpServer, type ActionResult, type OmniMcpEvent } from "@omni-ir/mcp";
import { z } from "zod";
const events: OmniMcpEvent[] = [];
export const server = createOmniMcpServer({
  tools: { "orders.requestReturn": z.strictObject({ orderId: z.string() }) },
  onAction: async (): Promise<ActionResult> => ({ ok: false, code: "not_found", message: "No such order." }),
  onEvent: (event) => events.push(event),
});
`,
  );
  write("src/css.d.ts", 'declare module "*.css";\n');
  // The browser packages type-check without Node's types; @omni-ir/mcp is a server package, and the
  // MCP SDK's types need them, so it gets its own check.
  const tsconfig = (resolution, only) =>
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: resolution === "nodenext" ? "nodenext" : "esnext",
        moduleResolution: resolution,
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        types: only ? ["node"] : [],
      },
      include: only ? [only] : ["src"],
      exclude: only ? [] : ["src/mcp.ts"],
    });
  write("tsconfig.json", tsconfig("nodenext"));
  write("tsconfig.bundler.json", tsconfig("bundler"));
  write("tsconfig.mcp.json", tsconfig("nodenext", "src/mcp.ts"));

  write("index.html", '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.js"></script></body></html>\n');
  write(
    "src/main.js",
    `import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
${SCREEN}
createRoot(document.getElementById("root")).render(createElement(OmniRenderer, { store: parser.store, tools, assets, onMutation: () => {} }));
`,
  );

  // <omni-screen> (Step 21): typed without React's types, and bundled by Vite into a plain page.
  write(
    "src/elements-types.ts",
    `import "@omni-ir/elements";
import type { ElementComponent, OmniScreenElement } from "@omni-ir/elements";
const screen: OmniScreenElement = document.createElement("omni-screen");
screen.tools = { "payments.confirm": { type: "object", properties: { amount: { type: "number" } } } };
screen.onMutation = async (call) => console.log(call.tool, call.params);
screen.addEventListener("omni-event", (event) => console.log(event.detail.type));
const card: ElementComponent = { description: "A card", props: { name: { kind: "text" } }, tag: "shop-card" };
screen.components = { ShopCard: card };
void screen.generate("a payment confirmation").then((outcome) => outcome.status);
`,
  );
  write(
    "src/elements.js",
    `import "@omni-ir/elements";
const screen = document.createElement("omni-screen");
document.body.append(screen);
screen.write('root = Text("Hello from omni-screen")\\n');
`,
  );
  write("elements.html", '<!doctype html><html><body><script type="module" src="/src/elements.js"></script></body></html>\n');

  console.log(`\ninstall test in ${dir}`);
  run("npm install --no-audit --no-fund --loglevel=error");
  run("node render.mjs");
  run("node mcp.mjs");
  run("npx tsc -p tsconfig.json");
  console.log("types (nodenext): ok");
  run("npx tsc -p tsconfig.bundler.json");
  console.log("types (bundler): ok");
  run("npx tsc -p tsconfig.mcp.json");
  console.log("types (@omni-ir/mcp, nodenext): ok");
  run("npx vite build --logLevel warn");
  // The element's page, built on its own: the bundle must carry <omni-screen>.
  write("vite.elements.config.js", 'export default { build: { outDir: "dist-elements", rollupOptions: { input: "elements.html" } } };\n');
  run("npx vite build --config vite.elements.config.js --logLevel warn");
  const elementsAssets = join(dir, "dist-elements", "assets");
  if (!readdirSync(elementsAssets).some((f) => f.endsWith(".js") && readFileSync(join(elementsAssets, f), "utf8").includes("omni-screen"))) {
    throw new Error("the Vite build of the element's page has no <omni-screen>");
  }
  console.log("vite build: ok (<omni-screen> bundled)");
  const assetsDir = join(dir, "dist", "assets");
  const css = readdirSync(assetsDir).filter((f) => f.endsWith(".css"));
  if (!css.length || !readFileSync(join(assetsDir, css[0]), "utf8").includes(".omni-")) {
    throw new Error("the Vite build has no omni.css styles");
  }
  console.log("vite build: ok (omni.css bundled)");
  console.log("\ninstall test: ok");
} finally {
  if (keep) console.log(`kept ${resolve(dir)}`);
  else rmSync(dir, { recursive: true, force: true });
}
