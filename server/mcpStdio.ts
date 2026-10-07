// npm run mcp: the reference server's MCP Apps bridge over stdio, for trying Omni-IR screens in a
// local MCP Apps host such as Claude desktop (PLAN-MCPAPPS.md, D.1). The demo tools and pictures,
// actions as the demo visitor when OMNI_AUTH=demo (the default here), the store in memory or in
// OMNI_DB. stdout carries the protocol, so everything else goes to stderr. No model is called: the
// host's own model writes the screens.
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createDevMailer } from "./backend/auth";
import { createMemoryStore } from "./backend/memoryStore";
import { DEMO_VISITOR_EMAIL, seedDemo } from "./backend/seed";
import type { Store } from "./backend/types";
import { loadConfig } from "./config";
import { loadView, referenceMcp } from "./mcp";
import { HANDLERS } from "./tools/handlers";

const { config, warnings } = loadConfig({ OMNI_AUTH: "demo", ...process.env });
for (const warning of warnings) console.error(`warning: ${warning}`);
const store: Store = config.dbPath ? (await import("./backend/sqliteStore")).createSqliteStore(config.dbPath) : createMemoryStore();
await seedDemo(store);
const user = config.auth === "demo" ? await store.users.ensure(DEMO_VISITOR_EMAIL) : null;
const mailer = createDevMailer((line) => console.error(line));

const { serverFor } = referenceMcp({
  tools: TOOLS,
  assets: ASSETS,
  handlers: HANDLERS,
  context: () => ({ store, mailer, now: Date.now(), publicUrl: config.publicUrl }),
  viewHtml: loadView(),
  log: (entry) => console.error(JSON.stringify({ time: new Date().toISOString(), ...entry })),
});
serveStdio(() => serverFor(user));
console.error(`omni-ir MCP server on stdio (${user ? "acting as the demo visitor" : "no one signed in: public actions only"})`);
