// R5 + R6: the only path from a Button press to onMutation.
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { InteractionProps } from "../catalog/types.js";
import type { MutationStatement, Primitive, StateRef } from "@omni-ir/core";
import { runHandler, useOmni, useStateValues } from "./context.js";

type Governance = InteractionProps["Button"];

interface Props {
  /** The Button being governed. */
  id: string;
  children: (governance: Governance) => ReactNode;
}

function isStateRef(value: unknown): value is StateRef {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "state";
}

export function McpMutationBoundary({ id, children }: Props) {
  const ctx = useOmni();
  const { store, tools } = ctx;
  const getMutation = () => store.getSnapshot().mutations.get(id);
  const mutation = useSyncExternalStore(store.subscribe, getMutation, getMutation);
  const paramKeys = mutation ? Object.values(mutation.params).filter(isStateRef).map((ref) => ref.key) : [];
  const paramValues = useStateValues(paramKeys);
  // A blocked press stays blocked until one of the values it used changes.
  const [blocked, setBlocked] = useState<{ message: string; values: readonly Primitive[] } | null>(null);

  // Not governed yet (still streaming) or never governed (end-of-stream error): not clickable.
  if (mutation === undefined) {
    return children({ onPress: undefined, disabled: true, error: undefined, mcpTool: undefined });
  }

  // Second line of defense: the parser already rejects unknown tools, but the boundary checks again.
  const schema = Object.hasOwn(tools, mutation.tool) ? tools[mutation.tool] : undefined;
  if (schema === undefined) {
    return children({
      onPress: undefined,
      disabled: true,
      error: `"${mutation.tool}" is not a permitted action`,
      mcpTool: mutation.tool,
    });
  }

  const error = blocked !== null && blocked.values === paramValues ? blocked.message : undefined;

  const onPress = () =>
    runHandler(ctx.report, id, () => {
      const params = resolveParams(mutation, store.getSnapshot().state);
      const parsed = schema.safeParse(params);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
          .join("; ");
        setBlocked({ message, values: paramValues });
        ctx.report({ type: "error", issue: { code: "mutation_blocked", message, id: mutation.id } });
        return;
      }
      return ctx.onMutation({
        id: mutation.id,
        target: mutation.target,
        tool: mutation.tool,
        params: parsed.data as Record<string, unknown>,
      });
    });

  return children({
    onPress: error === undefined ? onPress : undefined,
    disabled: error !== undefined,
    error,
    mcpTool: mutation.tool,
  });
}

function resolveParams(mutation: MutationStatement, state: Readonly<Record<string, Primitive>>) {
  const params: Record<string, Primitive> = {};
  for (const [name, value] of Object.entries(mutation.params)) {
    params[name] = isStateRef(value) ? (state[value.key] ?? null) : value;
  }
  return params;
}
