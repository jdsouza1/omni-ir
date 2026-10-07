// The reference server's MCP Apps endpoint (PLAN-MCPAPPS.md, B): @omni-ir/mcp with the reference
// handlers. Actions go through runMutation, like POST /api/mutate, so they get the same access rules,
// ownership checks, idempotency keys and audit trail. Counts of screens shown and actions run, for
// the log and /api/health (B.5): never a screen's text or an action's params.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolRegistry } from "@omni-ir/core";
import { createOmniMcpServer, type ActionResult, type OmniMcpEvent } from "@omni-ir/mcp";
import { OMNI_IR_VERSION } from "@omni-ir/core";
import type { AssetRegistry } from "../app/assets";
import { runMutation } from "./api";
import type { User } from "./backend/types";
import type { ToolContext, ToolHandler } from "./tools/handlers";

/**
 * Where `npm run mcp:view` writes the view. Found from this file, since an MCP host may start the
 * server from any folder; worked out only when needed, because tests that load this module in a
 * browser-like environment have no file URL for it.
 */
export function viewFile(): string {
  const url = new URL("../packages/mcp/dist/view.html", import.meta.url);
  return url.protocol === "file:" ? fileURLToPath(url) : resolve("packages/mcp/dist/view.html");
}

export function loadView(): string {
  const file = viewFile();
  if (!existsSync(file)) throw new Error(`The MCP view isn't built: run \`npm run mcp:view\` first (${file}).`);
  return readFileSync(file, "utf8");
}

export interface McpCounts {
  screens: number;
  rejectedLines: number;
  actions: Record<string, { ok: number; refused: number }>;
}

export interface ReferenceMcpOptions {
  tools: ToolRegistry;
  assets: AssetRegistry;
  handlers: Readonly<Record<string, ToolHandler>>;
  /** The handlers' context, at the time of each action. */
  context: () => ToolContext;
  viewHtml: string;
  log: (entry: Record<string, unknown>) => void;
}

/** One MCP server per request (or connection), for the person calling; counts shared across them. */
export function referenceMcp({ tools, assets, handlers, context, viewHtml, log }: ReferenceMcpOptions) {
  const counts: McpCounts = { screens: 0, rejectedLines: 0, actions: {} };
  const onEvent = (event: OmniMcpEvent) => {
    if (event.type === "screen") {
      counts.screens++;
      counts.rejectedLines += event.rejected;
    } else {
      const tally = (counts.actions[event.tool] ??= { ok: 0, refused: 0 });
      if (event.outcome === "ok") tally.ok++;
      else tally.refused++;
    }
    log({ event: "mcp", ...event });
  };

  const serverFor = (user: User | null) =>
    createOmniMcpServer({
      name: "omni-ir-reference",
      version: OMNI_IR_VERSION,
      tools,
      assets,
      viewHtml,
      user,
      onEvent,
      onAction: async ({ tool, params, idempotencyKey }): Promise<ActionResult> => {
        const answer = await runMutation({ tool, params, user, idempotencyKey }, { tools, handlers, ctx: context() });
        const body = answer.body as { result?: Record<string, unknown>; error?: { code?: string; message?: string } };
        if (answer.status < 400) return { ok: true, result: body.result ?? {} };
        return { ok: false, code: body.error?.code ?? answer.outcome, message: body.error?.message ?? "The action could not be completed." };
      },
    });

  return { serverFor, counts };
}
