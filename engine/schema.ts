// The Omni-IR protocol schema. This file is the single authority on what a stream may contain:
// which components exist, which props they take, flat syntax, the tool registry and the
// cross-line document rules. The parser and renderer only use the types exported here.
import { z } from "zod";
import type { Issue, RawStatement, RawValue } from "./types";

export const MAX_TEXT = 2000;
export const MAX_CHILDREN = 200;
export const ROOT_ID = "root";

// Literal keywords, plus names that would touch Object.prototype if used as keys.
const RESERVED = new Set(["true", "false", "null", "__proto__", "constructor", "prototype"]);

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export const Identifier = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "not a valid identifier")
  .refine((s) => !RESERVED.has(s), "reserved word");

export const StateKey = z
  .string()
  .max(65)
  .regex(/^\$[A-Za-z_][A-Za-z0-9_]*$/, "not a valid state key");

export const Primitive = z.union([z.string().max(MAX_TEXT), z.number().finite(), z.boolean(), z.null()]);
export type Primitive = z.infer<typeof Primitive>;

export const StateRef = z.strictObject({ kind: z.literal("state"), key: StateKey });
export type StateRef = z.infer<typeof StateRef>;

export const NodeRef = z.strictObject({ kind: z.literal("ref"), id: Identifier });
export type NodeRef = z.infer<typeof NodeRef>;

const Text = z.string().max(MAX_TEXT);
const TextOrState = z.union([Text, StateRef]);
const Children = z.array(NodeRef).max(MAX_CHILDREN);
const ActionName = z.string().regex(/^[a-z][A-Za-z0-9_]*$/, "not a valid action name").max(64);
const ToolName = z
  .string()
  .max(128)
  .regex(/^[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)+$/, "tool must look like namespace.action");

// ---------------------------------------------------------------------------
// The Trusted Catalog vocabulary. Every prop is an enum or plain text: there is no
// style, className, html or free-form attribute anywhere, and unknown keys are rejected.
// ---------------------------------------------------------------------------

export const COMPONENTS = {
  Stack: {
    positional: ["children"],
    props: z.strictObject({
      children: Children,
      direction: z.enum(["row", "column"]).optional(),
      gap: z.enum(["none", "sm", "md", "lg"]).optional(),
      align: z.enum(["start", "center", "end", "stretch"]).optional(),
    }),
  },
  Card: {
    positional: ["children"],
    props: z.strictObject({ children: Children, title: TextOrState.optional() }),
  },
  Heading: {
    positional: ["text"],
    props: z.strictObject({
      text: TextOrState,
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    }),
  },
  Text: {
    positional: ["text"],
    props: z.strictObject({
      text: z.union([Text, z.number().finite(), StateRef]),
      format: z.enum(["plain", "currency", "date"]).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code").optional(),
      tone: z.enum(["default", "muted", "strong"]).optional(),
    }),
  },
  Input: {
    positional: ["value"],
    props: z.strictObject({
      value: StateRef,
      label: z.string().min(1).max(200),
      placeholder: z.string().max(200).optional(),
    }),
  },
  Button: {
    positional: ["label"],
    props: z.strictObject({
      label: TextOrState,
      action: ActionName.optional(),
      variant: z.enum(["primary", "secondary", "danger"]).optional(),
    }),
  },
  Divider: {
    positional: [],
    props: z.strictObject({}),
  },
  Badge: {
    positional: ["text"],
    props: z.strictObject({
      text: TextOrState,
      tone: z.enum(["neutral", "success", "warning", "danger"]).optional(),
    }),
  },
  Skeleton: {
    positional: [],
    props: z.strictObject({ lines: z.number().int().min(1).max(6).optional() }),
  },
} as const satisfies Record<string, { positional: readonly string[]; props: z.ZodObject }>;

export type ComponentType = keyof typeof COMPONENTS;
export const COMPONENT_TYPES = Object.keys(COMPONENTS) as ComponentType[];

const MUTATION_TYPE = "McpMutation";

const MutationProps = z.strictObject({
  target: NodeRef,
  tool: ToolName,
  params: z.record(Identifier, z.union([Primitive, StateRef])).optional(),
});
const MUTATION_POSITIONAL = ["target"] as const;

// ---------------------------------------------------------------------------
// Validated statements (the only shapes the parser and renderer see)
// ---------------------------------------------------------------------------

export type ComponentProps = {
  [K in ComponentType]: Omit<z.infer<(typeof COMPONENTS)[K]["props"]>, "children">;
};

export type OmniNode = {
  [K in ComponentType]: {
    kind: "node";
    id: string;
    type: K;
    props: ComponentProps[K];
    children: readonly string[];
  };
}[ComponentType];

export interface MutationStatement {
  kind: "mutation";
  id: string;
  target: string;
  tool: string;
  params: Readonly<Record<string, Primitive | StateRef>>;
}

export interface StateStatement {
  kind: "state";
  key: string;
  value: Primitive;
}

export type Statement = OmniNode | MutationStatement | StateStatement;

/**
 * Tools the host app allows the UI to call, each with a schema for its params.
 * This lives in application code and can never come from the stream (R6).
 */
export type ToolRegistry = Readonly<Record<string, z.ZodType>>;

export interface ValidationContext {
  tools: ToolRegistry;
}

export type StatementResult = { ok: true; statement: Statement } | { ok: false; issues: Issue[] };

// ---------------------------------------------------------------------------
// Line-level validation
// ---------------------------------------------------------------------------

class FlatnessError extends Error {}
class ArgumentError extends Error {}

function toPropValue(value: RawValue): unknown {
  switch (value.kind) {
    case "string":
    case "number":
    case "boolean":
      return value.value;
    case "null":
      return null;
    case "ident":
      return { kind: "ref", id: value.name };
    case "state":
      return { kind: "state", key: value.key };
    case "array":
      return value.items.map(toPropValue);
    case "object": {
      // Null prototype: a "__proto__" key becomes an ordinary key the schema rejects.
      const out: Record<string, unknown> = Object.create(null);
      for (const [key, item] of value.entries) {
        // Zod drops a "__proto__" record key silently; reject reserved keys explicitly instead.
        if (RESERVED.has(key)) throw new ArgumentError(`"${key}" is a reserved key`);
        if (Object.hasOwn(out, key)) throw new ArgumentError(`duplicate key "${key}"`);
        out[key] = toPropValue(item);
      }
      return out;
    }
    case "call":
      throw new FlatnessError(
        `nested component call ${value.callee}(…) is not allowed; put it on its own line and reference it by id`,
      );
  }
}

function zodIssues(error: z.ZodError, id: string): Issue[] {
  return error.issues.map((issue) => ({
    code: "invalid_props" as const,
    message: issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    id,
    path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
  }));
}

/** Map positional and named arguments onto one props object. */
function collectProps(raw: Extract<RawStatement, { kind: "call" }>, positional: readonly string[]): Record<string, unknown> {
  if (raw.args.length > positional.length) {
    throw new TypeError(
      `${raw.callee} takes ${positional.length} positional argument(s) but got ${raw.args.length}`,
    );
  }
  const props: Record<string, unknown> = Object.create(null);
  raw.args.forEach((arg, i) => {
    props[positional[i]!] = toPropValue(arg);
  });
  for (const [name, arg] of raw.named) {
    if (Object.hasOwn(props, name)) throw new ArgumentError(`argument "${name}" given more than once`);
    props[name] = toPropValue(arg);
  }
  return props;
}

/** Validate one statement on its own. Cross-line rules live in `validateDocument`. */
export function validateStatement(raw: RawStatement, ctx: ValidationContext): StatementResult {
  if (raw.kind === "state") {
    const key = StateKey.safeParse(raw.key);
    if (!key.success) return { ok: false, issues: zodIssues(key.error, raw.key) };
    let value: unknown;
    try {
      value = toPropValue(raw.value);
    } catch (err) {
      return fail(err, raw.key);
    }
    const parsed = Primitive.safeParse(value);
    if (!parsed.success) {
      return {
        ok: false,
        issues: [{ code: "invalid_props", message: "state values must be a string, number, boolean or null", id: raw.key }],
      };
    }
    return { ok: true, statement: { kind: "state", key: raw.key, value: parsed.data } };
  }

  const id = Identifier.safeParse(raw.id);
  if (!id.success) return { ok: false, issues: zodIssues(id.error, raw.id) };

  if (raw.callee === MUTATION_TYPE) return validateMutation(raw, ctx);

  if (!Object.hasOwn(COMPONENTS, raw.callee)) {
    return {
      ok: false,
      issues: [{ code: "unknown_component", message: `"${raw.callee}" is not in the Trusted Catalog`, id: raw.id }],
    };
  }
  const type = raw.callee as ComponentType;
  const spec = COMPONENTS[type];

  let props: Record<string, unknown>;
  try {
    props = collectProps(raw, spec.positional);
  } catch (err) {
    return fail(err, raw.id);
  }
  const parsed = spec.props.safeParse(props);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error, raw.id) };

  const { children, ...rest } = parsed.data as { children?: NodeRef[] } & Record<string, unknown>;
  const node = {
    kind: "node",
    id: raw.id,
    type,
    props: rest,
    children: (children ?? []).map((ref) => ref.id),
  } as OmniNode;
  return { ok: true, statement: node };
}

function validateMutation(raw: Extract<RawStatement, { kind: "call" }>, ctx: ValidationContext): StatementResult {
  let props: Record<string, unknown>;
  try {
    props = collectProps(raw, MUTATION_POSITIONAL);
  } catch (err) {
    return fail(err, raw.id);
  }
  const parsed = MutationProps.safeParse(props);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error, raw.id) };
  const { target, tool, params } = parsed.data;
  if (!Object.hasOwn(ctx.tools, tool)) {
    return {
      ok: false,
      issues: [{ code: "unknown_tool", message: `tool "${tool}" is not in the client tool registry`, id: raw.id }],
    };
  }
  return { ok: true, statement: { kind: "mutation", id: raw.id, target: target.id, tool, params: params ?? {} } };
}

function fail(err: unknown, id: string): StatementResult {
  if (err instanceof FlatnessError) return { ok: false, issues: [{ code: "not_flat", message: err.message, id }] };
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, issues: [{ code: "invalid_props", message, id }] };
}

// ---------------------------------------------------------------------------
// Document-level validation
// ---------------------------------------------------------------------------

/** True when a node triggers a backend mutation and therefore must be wrapped by an McpMutation. */
export function isMutating(node: OmniNode): boolean {
  return node.type === "Button" && node.props.action !== undefined;
}

/** Every state key a node reads or writes. */
export function stateKeysOf(statement: OmniNode | MutationStatement): string[] {
  const values = statement.kind === "mutation" ? Object.values(statement.params) : Object.values(statement.props);
  return values.flatMap((v) =>
    v !== null && typeof v === "object" && "kind" in v && v.kind === "state" ? [v.key] : [],
  );
}

export interface DocumentOptions {
  /**
   * `false` while streaming: only rules that a later line can never fix are checked.
   * `true` at end of stream: also checks dangling references, missing root and governance.
   */
  complete: boolean;
}

/** Cross-line rules for a list of individually validated statements, in stream order. */
export function validateDocument(statements: readonly Statement[], opts: DocumentOptions): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map<string, OmniNode | MutationStatement>();
  const state = new Map<string, Primitive>();

  for (const s of statements) {
    if (s.kind === "state") {
      if (state.has(s.key)) issues.push({ code: "duplicate_id", message: `${s.key} is assigned more than once`, id: s.key });
      else state.set(s.key, s.value);
    } else if (byId.has(s.id)) {
      issues.push({ code: "duplicate_id", message: `"${s.id}" is assigned more than once`, id: s.id });
    } else {
      byId.set(s.id, s);
    }
  }

  const nodes = [...byId.values()].filter((s): s is OmniNode => s.kind === "node");
  const mutations = [...byId.values()].filter((s): s is MutationStatement => s.kind === "mutation");

  // Tree shape: one parent per node, no repeats in a children list, root is never a child.
  const parentOf = new Map<string, string>();
  for (const node of nodes) {
    const seen = new Set<string>();
    for (const child of node.children) {
      if (seen.has(child)) {
        issues.push({ code: "duplicate_child", message: `"${child}" appears twice in ${node.id}'s children`, id: node.id });
        continue;
      }
      seen.add(child);
      if (child === ROOT_ID) {
        issues.push({ code: "root_as_child", message: `"${ROOT_ID}" cannot be a child`, id: node.id });
        continue;
      }
      if (byId.get(child)?.kind === "mutation") {
        issues.push({ code: "child_not_component", message: `"${child}" is an McpMutation, not a component`, id: node.id });
        continue;
      }
      const existing = parentOf.get(child);
      if (existing !== undefined) {
        issues.push({
          code: "multiple_parents",
          message: `"${child}" already belongs to "${existing}" and cannot also be a child of "${node.id}"`,
          id: node.id,
        });
        continue;
      }
      parentOf.set(child, node.id);
    }
  }

  // Cycles: follow parent links upward; returning to the start means a cycle.
  const reported = new Set<string>();
  for (const node of nodes) {
    const path = new Set<string>([node.id]);
    let current = parentOf.get(node.id);
    while (current !== undefined && !path.has(current)) {
      path.add(current);
      current = parentOf.get(current);
    }
    if (current === node.id && !reported.has(node.id)) {
      for (const member of path) reported.add(member);
      issues.push({ code: "cycle", message: `"${node.id}" contains itself through its children`, id: node.id });
    }
  }

  // Inputs edit text, so their state must hold a string.
  for (const node of nodes) {
    if (node.type !== "Input") continue;
    const key = node.props.value.key;
    if (state.has(key) && typeof state.get(key) !== "string") {
      issues.push({ code: "input_state_type", message: `Input "${node.id}" is bound to ${key}, which is not a string`, id: node.id });
    }
  }

  const governed = new Map<string, string>();
  for (const m of mutations) {
    const existing = governed.get(m.target);
    if (existing !== undefined) {
      issues.push({
        code: "duplicate_mutation",
        message: `"${m.target}" is already governed by "${existing}"`,
        id: m.id,
      });
    } else {
      governed.set(m.target, m.id);
    }
  }

  if (!opts.complete) return issues;

  if (!byId.has(ROOT_ID)) issues.push({ code: "missing_root", message: `no "${ROOT_ID} = …" line was received` });

  for (const node of nodes) {
    for (const child of node.children) {
      if (!byId.has(child)) {
        // Reported against the node holding the reference: it has a line, the missing id never did.
        issues.push({ code: "dangling_ref", message: `"${node.id}" references "${child}", which never arrived`, id: node.id });
      }
    }
  }

  for (const s of [...nodes, ...mutations]) {
    for (const key of stateKeysOf(s)) {
      if (!state.has(key)) {
        issues.push({ code: "missing_state", message: `"${s.id}" uses ${key}, which was never declared`, id: s.id });
      }
    }
  }

  for (const m of mutations) {
    const target = byId.get(m.target);
    if (target === undefined) {
      issues.push({ code: "dangling_ref", message: `"${m.id}" targets "${m.target}", which never arrived`, id: m.id });
    } else if (target.kind !== "node" || !isMutating(target)) {
      issues.push({
        code: "mutation_target_not_interactive",
        message: `"${m.id}" targets "${m.target}", which has no action to govern`,
        id: m.id,
      });
    }
  }

  for (const node of nodes) {
    if (isMutating(node) && !governed.has(node.id)) {
      issues.push({
        code: "ungoverned_mutation",
        message: `"${node.id}" has an action but is not wrapped by an McpMutation`,
        id: node.id,
      });
    }
  }

  return issues;
}
