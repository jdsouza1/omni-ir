// Vite config for the playground. The Omni-IR Express app runs inside the dev server for /api/*,
// so `npm run playground` is one process on one origin. It uses the server's normal config, which
// means the free MockModel unless OMNI_MODEL=claude is set explicitly.
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { defineConfig, type Connect, type Plugin } from "vite";
import { createApp } from "../server/app";
import { loadConfig } from "../server/config";
import { createModel } from "../server/models";

function omniApi(): Plugin {
  const mount = (middlewares: Connect.Server) => {
    const { config, warnings } = loadConfig();
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    const model = createModel(config);
    const app = createApp({ config, model });
    console.log(`Omni-IR API mounted at /api (model: ${model.kind})`);
    middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.url?.startsWith("/api/")) app(req as never, res as never);
      else next();
    });
  };
  return {
    name: "omni-api",
    configureServer: (server) => mount(server.middlewares),
    configurePreviewServer: (server) => mount(server.middlewares),
  };
}

export default defineConfig({
  root: resolve("playground"),
  plugins: [omniApi()],
  server: { port: 5173, strictPort: false },
  build: { outDir: resolve("dist/playground"), emptyOutDir: true },
});
