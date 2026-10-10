// The MCP server of the bridge (PLAN-MCPAPPS.md, SPEC.md [10.25]–[10.28]). The host's model calls
// show_screen with Omni-IR text; the host draws it with our view (one HTML file with the parser and
// catalog inside). Each registered tool is also an MCP tool only the view can call, and every call is
// checked again here before the app's code runs.
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createParser, describeScreen, type ToolRegistry } from "@omni-ir/core";
import { injectConfig, viewConfig } from "./config.js";
import { IDEMPOTENCY_META_KEY, SCREEN_TOOL, VIEW_URI } from "./constants.js";
import { buildGuide, type Picture } from "./guide.js";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_\-:.]{1,200}$/;
/** The longest screen show_screen accepts, in characters. */
export const MAX_SCREEN_CHARS = 200_000;

export interface ActionCall {
  tool: string;
  /** Params already checked against the tool's schema. */
  params: Record<string, unknown>;
  idempotencyKey: string | null;
  /** Who is calling, as the app identified them (OmniMcpOptions.user), or null. */
  user: unknown;
}

export type ActionResult =
  | { ok: true; result?: Record<string, unknown>; message?: string }
  | { ok: false; code: string; message: string };

/** For logs and counts ([B.5]): never the screen's text or an action's params. */
export type OmniMcpEvent =
  | { type: "screen"; components: number; rejected: number }
  | { type: "action"; tool: string; outcome: string };

export interface OmniMcpOptions {
  name?: string;
  version?: string;
  /** The app's tools. Without onAction they are ignored: screens only, no actions. */
  tools?: ToolRegistry;
  /** Pictures screens may name; their `src` must be a `data:` URI, because the view has no network. */
  assets?: Readonly<Record<string, Picture>>;
  /** Runs an action after its params passed the tool's schema: the app's own access rules, idempotency and audit. */
  onAction?: (call: ActionCall) => Promise<ActionResult>;
  /** Who is calling, for onAction (from MCP's authorization, per connection or request). */
  user?: unknown;
  onEvent?: (event: OmniMcpEvent) => void;
  /** The view's HTML; defaults to the one built into the package. */
  viewHtml?: string;
}

let builtView: string | undefined;
function defaultView(): string {
  builtView ??= readFileSync(new URL("./view.html", import.meta.url), "utf8");
  return builtView;
}

export function createOmniMcpServer(options: OmniMcpOptions = {}): McpServer {
  const { onAction, onEvent = () => {}, user = null } = options;
  const tools: ToolRegistry = onAction ? (options.tools ?? {}) : {};
  const assets = options.assets ?? {};
  const server = new McpServer({ name: options.name ?? "omni-ir", version: options.version ?? "0.0.0" });
  const html = injectConfig(options.viewHtml ?? defaultView(), viewConfig({ tools, assets }));

  registerAppResource(server, "Omni-IR screen", VIEW_URI, { description: "Draws Omni-IR screens with the app's own components.", mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
  }));

  registerAppTool(
    server,
    SCREEN_TOOL,
    {
      title: "Show a screen",
      description: buildGuide({ tools, assets }),
      inputSchema: z.object({ screen: z.string().min(1).max(MAX_SCREEN_CHARS).describe("The screen, in Omni-IR lines") }),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: VIEW_URI } },
    },
    async ({ screen }) => {
      // The same checks the view makes, so the model learns which lines were rejected ([10.27]).
      const parser = createParser({ tools, assets });
      const rejected: { line: number | null; code: string; message: string }[] = [];
      parser.subscribe((e) => {
        if (e.type === "error") rejected.push({ line: e.issue.line ?? null, code: e.issue.code, message: e.issue.message });
      });
      parser.write(screen);
      parser.end();
      const document = parser.getSnapshot();
      const components = document.nodes.size;
      onEvent({ type: "screen", components, rejected: rejected.length });
      // The screen as text, for hosts that can't draw the view (no typed values: nothing is typed yet).
      const outline = describeScreen(document);
      const shown = `Shown: ${components} ${components === 1 ? "component" : "components"}.`;
      const text =
        (rejected.length === 0
          ? shown
          : `${shown} These lines were rejected; call ${SCREEN_TOOL} again with the whole screen, fixed:\n` +
            rejected.map((r) => `- ${r.line === null ? "at the end" : `line ${r.line}`}: ${r.code}: ${r.message}`).join("\n")) +
        `\n\nThe screen as text:\n${outline}`;
      return { content: [{ type: "text", text }], structuredContent: { components, rejected, outline } };
    },
  );

  for (const [name, schema] of Object.entries(tools)) {
    registerAppTool(
      server,
      name,
      {
        description: `An action on this app's screens (${name}). Only the screen can call it.`,
        // Open here and checked below against the tool's own schema, refinements included, so every
        // refusal is ours to count and explain.
        inputSchema: z.looseObject({}),
        _meta: { ui: { resourceUri: VIEW_URI, visibility: ["app"] } },
      },
      async (args, ctx) => {
        const report = (outcome: string) => onEvent({ type: "action", tool: name, outcome });
        const parsed = schema.safeParse(args);
        if (!parsed.success) {
          report("invalid_params");
          const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
          return failure("invalid_params", "The action's details are not valid.", { issues });
        }
        const key = ctx.mcpReq._meta?.[IDEMPOTENCY_META_KEY];
        const call: ActionCall = {
          tool: name,
          params: parsed.data as Record<string, unknown>,
          idempotencyKey: typeof key === "string" && IDEMPOTENCY_KEY.test(key) ? key : null,
          user,
        };
        let result: ActionResult;
        try {
          result = await (onAction as NonNullable<typeof onAction>)(call);
        } catch {
          report("tool_failed");
          return failure("tool_failed", "The action failed.");
        }
        report(result.ok ? "ok" : result.code);
        if (!result.ok) return failure(result.code, result.message);
        return { content: [{ type: "text", text: result.message ?? "Done." }], structuredContent: result.result ?? {} };
      },
    );
  }
  return server;
}

function failure(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { isError: true, content: [{ type: "text" as const, text: message }], structuredContent: { code, message, ...extra } };
}
