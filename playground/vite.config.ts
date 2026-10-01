// Vite config for the playground. The Omni-IR Express app runs inside the dev server for /api/*,
// so `npm run playground` is one process on one origin. It uses the server's normal config, which
// means the free MockModel unless OMNI_MODEL=claude is set explicitly.
//
// The server code is loaded through Vite's module loader rather than imported here, so its
// `@omni-ir/*` imports resolve to the packages' source (WORKSPACE_ALIASES) without a build.
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createServer, defineConfig, type Connect, type Plugin } from "vite";
import { WORKSPACE_ALIASES } from "../scripts/workspace-aliases.ts";

type Load = (path: string) => Promise<Record<string, unknown>>;

async function createOmniApp(load: Load) {
  const [{ createApp }, { loadConfig }, { createModel }] = (await Promise.all([
    load(resolve("server/app.ts")),
    load(resolve("server/config.ts")),
    load(resolve("server/models/index.ts")),
  ])) as [typeof import("../server/app.ts"), typeof import("../server/config.ts"), typeof import("../server/models/index.ts")];
  const { config, warnings } = loadConfig();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  const model = createModel(config);
  console.log(`Omni-IR API mounted at /api (model: ${model.kind})`);
  return createApp({ config, model });
}

function omniApi(): Plugin {
  // Registered straight away so /api/* is handled before Vite's own middlewares; requests wait
  // for the app to finish loading.
  const mount = (middlewares: Connect.Server, app: ReturnType<typeof createOmniApp>) => {
    app.catch((err: unknown) => console.error("Omni-IR API failed to load:", err));
    middlewares.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      if (!req.url?.startsWith("/api/")) return next();
      app.then((handle) => handle(req as never, res as never), next);
    });
  };
  return {
    name: "omni-api",
    configureServer: (server) => mount(server.middlewares, createOmniApp((path) => server.ssrLoadModule(path))),
    configurePreviewServer: (server) => {
      // `vite preview` has no module loader, so start a small one just for the server code.
      const loader = createServer({
        configFile: false,
        resolve: { alias: WORKSPACE_ALIASES },
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: "custom",
        logLevel: "silent",
      });
      server.httpServer.once("close", () => void loader.then((l) => l.close()));
      mount(server.middlewares, loader.then((l) => createOmniApp((path) => l.ssrLoadModule(path))));
    },
  };
}

export default defineConfig({
  root: resolve("playground"),
  plugins: [omniApi()],
  resolve: { alias: WORKSPACE_ALIASES },
  server: { port: 5173, strictPort: false },
  build: { outDir: resolve("dist/playground"), emptyOutDir: true },
});
