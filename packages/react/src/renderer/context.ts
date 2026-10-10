import type { OmniStrings } from "../catalog/strings.js";
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
  /** The renderer's own words: the app's, or English. */
  strings: OmniStrings;
  /** Which fields show their messages ([8.5]): after the person leaves them, or after a press reads them. */
  fields: FieldVisibility;
  /** The app's confirmation sentence for each tool that needs one ([9.1]). */
  confirm: Readonly<Record<string, string>>;
  /** Show the renderer's own confirmation with this text; resolves true only on Confirm. */
  askConfirmation: (text: string) => Promise<boolean>;
  /** The renderer's root element, to move focus to a field that needs attention. */
  root: { current: HTMLElement | null };
  onMutation: (call: MutationCall) => void | Promise<void>;
  report: (event: RendererEvent) => void;
}

export const OmniContext = createContext<OmniContextValue | null>(null);

export interface FieldVisibility {
  subscribe(listener: () => void): () => void;
  isShown(id: string): boolean;
  show(ids: readonly string[]): void;
}

/** The fields whose messages are showing. Shown once, a message stays until the field passes. */
export function createFieldVisibility(): FieldVisibility {
  const shown = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isShown: (id) => shown.has(id),
    show(ids) {
      const added = ids.filter((id) => !shown.has(id));
      if (added.length === 0) return;
      for (const id of added) shown.add(id);
      for (const listener of listeners) listener();
    },
  };
}

/** The confirmation that is open, if any: its text and how to answer it. */
export interface PendingConfirmation {
  text: string;
  answer: (confirmed: boolean) => void;
}

export function createConfirmations() {
  let pending: PendingConfirmation | null = null;
  const listeners = new Set<() => void>();
  const set = (next: PendingConfirmation | null) => {
    pending = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => pending,
    ask(text: string): Promise<boolean> {
      // A second press while one is open answers the first with Cancel: one question at a time.
      pending?.answer(false);
      return new Promise<boolean>((resolve) => {
        const entry: PendingConfirmation = {
          text,
          answer: (confirmed) => {
            if (pending === entry) set(null);
            resolve(confirmed);
          },
        };
        set(entry);
      });
    },
  };
}

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
