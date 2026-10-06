// Starts the Omni-IR server: npm run server
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { createModel } from "./models";

try {
  const { config, warnings } = loadConfig();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  const model = createModel(config);
  const app = createApp({ config, model });
  const server = app.listen(config.port, () => {
    console.log(`Omni-IR server on http://localhost:${config.port} (model: ${model.kind}, sign-in: ${config.auth}, data: ${config.dbPath ?? "in memory"})`);
  });
  // Stop cleanly, so a SQLite file (OMNI_DB) is closed properly.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      server.close(() => void (app.locals.closeStore as () => Promise<void>)().finally(() => process.exit(0)));
    });
  }
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
