// R5 + R6: the only path from a Button press to onMutation.
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { InteractionProps } from "../catalog/types.js";
import { checkField, fieldKey, fieldsReadBy, isField, type MutationStatement, type Primitive, type StateRef } from "@omni-ir/core";
import { fillTemplate } from "../catalog/strings.js";
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
      error: ctx.strings.blocked,
      mcpTool: mutation.tool,
    });
  }

  // The person sees a plain sentence; the detail (which param, why) goes to the app's onEvent.
  const error = blocked !== null && blocked.values === paramValues ? ctx.strings.blocked : undefined;

  const onPress = () =>
    runHandler(ctx.report, id, async () => {
      const snapshot = store.getSnapshot();
      // [8.6]: the fields its params read must pass first; their messages show, and nothing is sent.
      const fields = fieldsReadBy(mutation, snapshot);
      const failing = fields.filter((fieldId) => {
        const field = snapshot.nodes.get(fieldId);
        return field !== undefined && isField(field) && checkField(field.type, field.props, snapshot.state[fieldKey(field)]) !== null;
      });
      if (failing.length > 0) {
        ctx.fields.show(fields);
        focusField(ctx.root.current, failing[0]!);
        return;
      }
      const params = resolveParams(mutation, snapshot.state);
      const parsed = schema.safeParse(params);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
          .join("; ");
        setBlocked({ message, values: paramValues });
        ctx.report({ type: "error", issue: { code: "mutation_blocked", message, id: mutation.id } });
        return;
      }
      // [9.1]: the app's own sentence for this tool, filled once with the params as plain text.
      // A function writes it from the checked params (a failure is reported and runs nothing).
      const confirmation = Object.hasOwn(ctx.confirm, mutation.tool) ? ctx.confirm[mutation.tool] : undefined;
      if (confirmation !== undefined) {
        const values = Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value === null ? "" : String(value)]));
        const text = typeof confirmation === "function" ? String(confirmation(parsed.data as Record<string, unknown>)) : fillTemplate(confirmation, values);
        if (!(await ctx.askConfirmation(text))) return;
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

/** Move focus to a field that needs attention, so keyboard and screen reader users land on it. */
function focusField(root: HTMLElement | null, id: string) {
  const control = root?.querySelector<HTMLElement>(`[data-node-id="${id}"] :is(input, textarea, select, button)`);
  control?.focus();
}

function resolveParams(mutation: MutationStatement, state: Readonly<Record<string, Primitive>>) {
  const params: Record<string, Primitive> = {};
  for (const [name, value] of Object.entries(mutation.params)) {
    params[name] = isStateRef(value) ? (state[value.key] ?? null) : value;
  }
  return params;
}
