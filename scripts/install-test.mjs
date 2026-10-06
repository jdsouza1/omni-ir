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
  for (const pkg of ["core", "react"]) {
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
        },
        devDependencies: {
          "@types/react": root.devDependencies["@types/react"],
          "@types/react-dom": root.devDependencies["@types/react-dom"],
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
  write("src/css.d.ts", 'declare module "*.css";\n');
  const tsconfig = (resolution) =>
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: resolution === "nodenext" ? "nodenext" : "esnext",
        moduleResolution: resolution,
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        types: [],
      },
      include: ["src"],
    });
  write("tsconfig.json", tsconfig("nodenext"));
  write("tsconfig.bundler.json", tsconfig("bundler"));

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

  console.log(`\ninstall test in ${dir}`);
  run("npm install --no-audit --no-fund --loglevel=error");
  run("node render.mjs");
  run("npx tsc -p tsconfig.json");
  console.log("types (nodenext): ok");
  run("npx tsc -p tsconfig.bundler.json");
  console.log("types (bundler): ok");
  run("npx vite build --logLevel warn");
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
