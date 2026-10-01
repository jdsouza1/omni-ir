import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { Catalog, Picture } from "../catalog/types.js";
import type { Primitive, ToolRegistry } from "@omni-ir/core";
import type { OmniStore } from "@omni-ir/core";
import type { Issue } from "@omni-ir/core";

export interface MutationCall {
  /** The McpMutation's own id. */
  id: string;
  /** The Button it governs. */
  target: string;
  tool: string;
  /** Params with state references filled in, already validated by the tool's schema. */
  params: Record<string, unknown>;
}

export type RendererEvent =
  | { type: "error"; issue: Issue }
  /** A Button without an action was pressed: purely local, never reaches the server. */
  | { type: "press"; id: string };

export interface OmniContextValue {
  store: OmniStore;
  tools: ToolRegistry;
  catalog: Catalog;
  /** The app's image asset registry; streams can only show pictures named here. */
  assets: Readonly<Record<string, Picture>>;
  locale: string;
  onMutation: (call: MutationCall) => void | Promise<void>;
  report: (event: RendererEvent) => void;
}

export const OmniContext = createContext<OmniContextValue | null>(null);

export function useOmni(): OmniContextValue {
  const ctx = useContext(OmniContext);
  if (ctx === null) throw new Error("Omni-IR components must be rendered inside <OmniRenderer>");
  return ctx;
}

/**
 * Current values of the given state keys. Returns the same array while the values are unchanged,
 * so components re-render only when a state value they read actually changes.
 */
export function useStateValues(keys: readonly string[]): readonly Primitive[] {
  const { store } = useOmni();
  const cache = useRef<readonly Primitive[]>([]);
  const get = () => {
    const state = store.getSnapshot().state;
    const next = keys.map((key) => state[key] ?? null);
    const prev = cache.current;
    if (prev.length === next.length && prev.every((v, i) => Object.is(v, next[i]))) return prev;
    cache.current = next;
    return next;
  };
  // Same getter on the server, so the tree can also be rendered with renderToString.
  return useSyncExternalStore(store.subscribe, get, get);
}

/** Run a catalog handler; a throw is reported instead of escaping (R7). */
export function runHandler(report: OmniContextValue["report"], id: string, fn: () => void | Promise<void>): void {
  const fail = (err: unknown) =>
    report({
      type: "error",
      issue: { code: "handler_failed", message: err instanceof Error ? err.message : String(err), id },
    });
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(fail);
  } catch (err) {
    fail(err);
  }
}
