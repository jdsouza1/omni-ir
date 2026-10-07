#!/usr/bin/env node
// npx @omni-ir/mcp: an MCP server over stdio that shows Omni-IR screens in MCP Apps hosts (Claude
// desktop, VS Code, Cursor and others), with no actions and no pictures. Apps that want actions,
// pictures or HTTP import createOmniMcpServer and give it their tools.
import { createRequire } from "node:module";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createOmniMcpServer } from "./server.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
serveStdio(() => createOmniMcpServer({ name: "omni-ir", version }));
