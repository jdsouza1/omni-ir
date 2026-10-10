// The bridge's view (PLAN-MCPAPPS.md, A): runs in the host's sandboxed iframe, receives show_screen's
// argument from the host, writes it to the parser line by line ([10.26]) and draws it with the Trusted
// Catalog. Pressed actions go to the server through the host ([10.28]). Bundled with React, the
// catalog and its CSS into one HTML file by scripts/mcp-view.ts; it never uses the network.
import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import type { App } from "@modelcontextprotocol/ext-apps";
import { createParser, defineComponents, type Issue, type OmniStore, type ToolRegistry } from "@omni-ir/core";
import { MutationRejectedError, OmniRenderer, type MutationCall, type RendererEvent } from "@omni-ir/react";
import type { ViewConfig } from "../config.js";
import { IDEMPOTENCY_META_KEY } from "../constants.js";
import { createInputWriter } from "./stream.js";
import { hostTheme, type HostContextLike, type HostTheme } from "./theme.js";

export interface ViewSnapshot {
  /** The current screen's store, once the first text arrived. */
  store: OmniStore | null;
  /** Errors from the parser and the renderer, for the console and tests. */
  issues: Issue[];
  look: HostTheme;
}

export interface ViewController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ViewSnapshot;
  readonly tools: ToolRegistry;
  readonly assets: ViewConfig["assets"];
  onMutation(call: MutationCall): Promise<void>;
  onEvent(event: RendererEvent): void;
}

/** Wire the view to the host. Call before `app.connect()`, so no notification is missed. */
export function createViewController(app: App, config: ViewConfig): ViewController {
  // The first check before sending: the server checks again with the tool's full schema.
  // The app's own components (Step 20): accepted and checked; this view draws the renderer's fallback for them.
  const components = defineComponents(config.components ?? {});
  const tools: ToolRegistry = Object.fromEntries(
    Object.entries(config.tools).map(([name, json]) => [name, z.fromJSONSchema(json as Parameters<typeof z.fromJSONSchema>[0])]),
  );
  let context: HostContextLike | undefined;
  let snapshot: ViewSnapshot = { store: null, issues: [], look: hostTheme(undefined) };
  const listeners = new Set<() => void>();
  const update = (change: Partial<ViewSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  };
  const addIssue = (issue: Issue) => update({ issues: [...snapshot.issues, issue] });
  const refreshLook = (change?: HostContextLike) => {
    context = { ...(context ?? (app.getHostContext() as HostContextLike | undefined)), ...change };
    update({ look: hostTheme(context) });
  };

  const writer = createInputWriter(() => {
    const parser = createParser({ tools, assets: config.assets, components, pictures: config.pictures ?? [] });
    parser.subscribe((event) => {
      if (event.type === "error") addIssue(event.issue);
    });
    update({ store: parser.store, issues: [] });
    return { write: (text) => parser.write(text), end: () => parser.end() };
  });
  const screenOf = (args: Record<string, unknown> | undefined) => (typeof args?.screen === "string" ? args.screen : null);
  app.ontoolinputpartial = ({ arguments: args }) => {
    const screen = screenOf(args);
    if (screen !== null) writer.partial(screen);
  };
  app.ontoolinput = ({ arguments: args }) => {
    const screen = screenOf(args);
    if (screen !== null) writer.complete(screen);
  };
  app.onhostcontextchanged = (change) => refreshLook(change as HostContextLike);

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (context === undefined) refreshLook();
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    tools,
    assets: config.assets,
    async onMutation(call) {
      const result = await app.callServerTool({
        name: call.tool,
        arguments: call.params,
        _meta: { [IDEMPOTENCY_META_KEY]: globalThis.crypto.randomUUID() },
      });
      if (result.isError) {
        const detail = (result.structuredContent ?? {}) as { code?: unknown; message?: unknown };
        const text = result.content.find((c) => c.type === "text");
        const message = typeof detail.message === "string" ? detail.message : text && "text" in text ? text.text : "The action failed.";
        throw new MutationRejectedError(message, typeof detail.code === "string" ? detail.code : undefined);
      }
    },
    onEvent(event) {
      if (event.type === "error") addIssue(event.issue);
    },
  };
}

export function OmniMcpView({ controller }: { controller: ViewController }) {
  const { store, look } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  // The frame's own colour scheme follows the host's theme: browsers paint an iframe opaque when its
  // scheme differs from the page around it, which would put a white box behind a dark screen.
  useEffect(() => {
    document.documentElement.style.colorScheme = look.theme;
  }, [look.theme]);
  // An id selector outranks the catalog's own token rules, so the host's values win.
  const css = Object.entries(look.variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return (
    <div id="omni-view">
      {css && <style>{`#omni-view .omni-root {\n${css}\n}`}</style>}
      {store && <OmniRenderer store={store} tools={controller.tools} assets={controller.assets} theme={look.theme} onMutation={controller.onMutation} onEvent={controller.onEvent} />}
    </div>
  );
}
