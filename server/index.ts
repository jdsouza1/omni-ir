// Starts the Omni-IR server: npm run server
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { createModel } from "./models";

try {
  const { config, warnings } = loadConfig();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  const model = createModel(config);
  createApp({ config, model }).listen(config.port, () => {
    console.log(`Omni-IR server on http://localhost:${config.port} (model: ${model.kind})`);
  });
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
