# @omni-ir/mcp

Omni-IR screens inside the AI apps people already use: Claude, ChatGPT, VS Code, Cursor and other hosts of [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), the official MCP extension for interactive views.

- The host's model calls the `show_screen` tool with a few lines of [Omni-IR](https://github.com/jdsouza1/omni-ir). The tool's description teaches it the format, generated from the schema and your tools.
- The host draws the screen in its sandboxed frame with Omni-IR's view: the parser and the Trusted Catalog in one HTML file, with no network access. The screen builds line by line while the model writes, in the host's colours.
- Buttons call your tools through the host, as MCP tools only the view can see. Your server checks every call against the tool's schema before your code runs, so the model can trigger only what you allow.
- If lines are rejected, the tool's result tells the model which ones and why, so it can fix the screen.

## Try it

```bash
npx @omni-ir/mcp
```

That starts an MCP server over stdio with screens only: no actions and no pictures. Add it to an MCP Apps host (for example Claude desktop's MCP servers) and ask for a screen.

## With your tools and pictures

```ts
import { createOmniMcpServer } from "@omni-ir/mcp";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const tools = {
  "orders.requestReturn": z.strictObject({ orderId: z.string().regex(/^[A-Z0-9-]{4,32}$/) }),
};

serveStdio(() =>
  createOmniMcpServer({
    name: "my-shop",
    version: "1.0.0",
    tools,
    // Pictures by name; `src` must be a data: URI, since the view can't use the network.
    assets: { tote: { src: "data:image/svg+xml,…", width: 200, height: 200 } },
    // Runs after the params passed the tool's schema: your access rules, idempotency and records.
    onAction: async ({ tool, params, idempotencyKey, user }) => {
      // …
      return { ok: true, result: { returnId: "R-1" }, message: "Return requested." };
    },
    onEvent: (event) => console.error(JSON.stringify(event)), // screens shown and actions run, for counts
  }),
);
```

Over HTTP, use the MCP SDK's `createMcpHandler` with a factory that passes who is calling (from MCP's authorization) as `user`, so each action runs as that person.

## In the repository

- `npm run mcp` runs the reference server's bridge over stdio, with the demo tools and pictures, acting as the demo visitor. Add it to a local MCP Apps host (Claude desktop's MCP servers, for example) to try screens with real actions. No model is called by the server: the host's model writes the screens.
- `OMNI_MCP=on npm run server` serves the same at `/mcp` over HTTP. Actions run through the same checks as `POST /api/mutate`: the tool's schema, its access rule (signed-in actions need `Authorization: Bearer <token>` from the server's sign-in), ownership, idempotency keys and the audit trail. A cookie never signs anyone in here, since any page could make a browser send it. `GET /api/health` then counts screens shown, rejected lines and actions per tool.
- Full MCP authorization (an OAuth authorization server with discovery) isn't part of the reference server: an app plugs in its identity provider's tokens with the SDK's bearer authentication and passes the person as `user`.

## Rules

The behaviour is specified in [SPEC.md](https://github.com/jdsouza1/omni-ir/blob/main/SPEC.md), section 10, "Over MCP Apps" ([10.25]–[10.28]). Apache-2.0.
