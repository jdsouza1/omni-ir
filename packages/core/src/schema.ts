// The Omni-IR protocol schema. This file is the single authority on what a stream may contain:
// which components exist, which props they take, flat syntax, the tool registry and the
// cross-line document rules. The parser and renderer only use the types exported here.
import { z } from "zod";
import type { Issue, IssueCode, RawStatement, RawValue } from "./types.js";

/** Size limits of the protocol (SPEC.md, generated "limits" section). */
export const LIMITS = {
  /** Longest line, in UTF-16 code units; enforced by the line buffer. */
  lineLength: 16 * 1024,
  /** Longest text value. */
  text: 2000,
  /** Most children in one list. */
  children: 200,
  /** Longest component id. */
  idLength: 64,
  /** Longest $state key, including the $. */
  stateKeyLength: 65,
  /** Longest tool name. */
  toolNameLength: 128,
  /** Longest action name. */
  actionNameLength: 64,
  /** Most columns in a Table, and cells in a TableRow. */
  tableColumns: 8,
  /** Most labels in a BarChart or LineChart, and values in a Series. */
  chartLabels: 24,
  /** Most Series in a BarChart or LineChart. */
  chartSeries: 6,
  /** Most Slices in a PieChart. */
  chartSlices: 8,
  /** Deepest nesting of lists, objects and calls inside one value. */
  nestingDepth: 8,
  /** Most components (McpMutations included) one stream may define. */
  components: 1000,
  /** Most $state keys one stream may declare. */
  stateKeys: 1000,
} as const;

export const MAX_TEXT = LIMITS.text;
export const MAX_CHILDREN = LIMITS.children;
export const ROOT_ID = "root";

// Literal keywords, plus names that would touch Object.prototype if used as keys.
export const RESERVED_WORDS = ["true", "false", "null", "__proto__", "constructor", "prototype"] as const;
const RESERVED = new Set<string>(RESERVED_WORDS);

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export const Identifier = z
  .string()
  .max(LIMITS.idLength)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "not a valid identifier")
  .refine((s) => !RESERVED.has(s), "reserved word");

export const StateKey = z
  .string()
  .max(LIMITS.stateKeyLength)
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
/** The visible name of a form control or tab. */
const Label = z.string().min(1).max(200);
const ActionName = z.string().regex(/^[a-z][A-Za-z0-9_]*$/, "not a valid action name").max(LIMITS.actionNameLength);
const ToolName = z
  .string()
  .max(LIMITS.toolNameLength)
  .regex(/^[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)+$/, "tool must look like namespace.action");
export const ASSET_NAME = /^[a-z0-9][a-z0-9-]*$/;
/** The name of an image in the app's asset registry; never a URL. */
const AssetName = z
  .string()
  .max(LIMITS.idLength)
  .regex(ASSET_NAME, "asset names are lowercase letters, digits and hyphens");
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IsoDate = z.string().regex(ISO_DATE, "dates are written YYYY-MM-DD");
/** A field the person must fill in, choose or turn on before an action that reads it can run. */
const Required = z.boolean().optional();
const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code");

// Charts carry data only: a title, labels and numbers. Colours, styles, tooltips and animation are
// the renderer's, so the props below are all there is.
const ChartFormat = z.enum(["number", "currency", "percent"]);
const XYChartProps = z.strictObject({
  /** Names the chart for everyone, including screen readers. */
  title: z.string().min(1).max(200),
  labels: z.array(z.string().min(1).max(60)).min(1).max(LIMITS.chartLabels),
  /** Series, one line each. */
  children: z.array(NodeRef).max(LIMITS.chartSeries),
  format: ChartFormat.optional(),
  currency: CurrencyCode.optional(),
});

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
    props: z
      .strictObject({
        value: StateRef,
        label: z.string().min(1).max(200),
        placeholder: z.string().max(200).optional(),
        /** Lines the box shows; more than 1 makes it a multi-line box (text scrolls inside it). */
        lines: z.number().int().min(1).max(10).optional(),
        // Constraints the renderer checks before an action that reads this field can run (SPEC.md [8.2]–[8.3]).
        required: Required,
        format: z.enum(["email", "number", "phone", "url"]).optional(),
        minLength: z.number().int().min(1).max(MAX_TEXT).optional(),
        maxLength: z.number().int().min(1).max(MAX_TEXT).optional(),
      })
      .refine((p) => p.minLength === undefined || p.maxLength === undefined || p.minLength <= p.maxLength, {
        message: "minLength must not be more than maxLength",
        path: ["minLength"],
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
  Image: {
    positional: ["asset"],
    props: z.strictObject({
      asset: AssetName,
      alt: z.string().min(1).max(300),
      ratio: z.enum(["1:1", "4:3", "3:2", "16:9"]).optional(),
    }),
  },
  Rating: {
    positional: ["value"],
    props: z
      .strictObject({
        value: z.union([z.number().finite().min(0), StateRef]),
        max: z.number().int().min(1).max(10).optional(),
      })
      .refine((p) => typeof p.value !== "number" || p.value <= (p.max ?? 5), {
        message: "value must not be more than max (default 5)",
        path: ["value"],
      }),
  },
  DateInput: {
    positional: ["value"],
    props: z.strictObject({
      value: StateRef,
      label: z.string().min(1).max(200),
      min: IsoDate.optional(),
      max: IsoDate.optional(),
      required: Required,
    }),
  },
  List: {
    positional: ["children"],
    props: z.strictObject({ children: Children }),
  },
  ListItem: {
    positional: ["title"],
    props: z.strictObject({
      title: TextOrState,
      detail: TextOrState.optional(),
      trailing: TextOrState.optional(),
      image: AssetName.optional(),
    }),
  },
  Message: {
    positional: ["text"],
    props: z.strictObject({
      text: TextOrState,
      from: z.enum(["user", "assistant"]),
    }),
  },
  Select: {
    positional: ["value"],
    props: z.strictObject({
      /** The text state holding the chosen option; "" (or any value not in options) means nothing chosen. */
      value: StateRef,
      label: Label,
      options: z.array(z.string().min(1).max(200)).min(1).max(50),
      placeholder: z.string().max(200).optional(),
      required: Required,
    }),
  },
  Switch: {
    positional: ["value"],
    props: z.strictObject({ value: StateRef, label: Label, required: Required }),
  },
  Table: {
    positional: ["columns", "children"],
    props: z.strictObject({
      columns: z.array(z.string().min(1).max(200)).min(1).max(LIMITS.tableColumns),
      /** TableRows, one line each. */
      children: Children,
    }),
  },
  TableRow: {
    positional: ["cells"],
    props: z.strictObject({
      /** One cell per column of its Table; numbers are aligned to the end. */
      cells: z.array(z.union([Text, z.number().finite()])).min(1).max(LIMITS.tableColumns),
    }),
  },
  Tabs: {
    positional: ["children"],
    props: z.strictObject({ children: Children }),
  },
  Tab: {
    positional: ["label", "children"],
    props: z.strictObject({ label: Label, children: Children }),
  },
  Notice: {
    positional: ["text"],
    props: z.strictObject({
      text: TextOrState,
      tone: z.enum(["info", "success", "warning", "danger"]).optional(),
      title: TextOrState.optional(),
    }),
  },
  BarChart: {
    positional: ["title", "labels", "children"],
    props: XYChartProps,
  },
  LineChart: {
    positional: ["title", "labels", "children"],
    props: XYChartProps,
  },
  PieChart: {
    positional: ["title", "children"],
    props: z.strictObject({
      title: z.string().min(1).max(200),
      /** Slices, one line each. */
      children: z.array(NodeRef).max(LIMITS.chartSlices),
      format: ChartFormat.optional(),
      currency: CurrencyCode.optional(),
    }),
  },
  Series: {
    positional: ["name", "values"],
    props: z.strictObject({
      name: z.string().min(1).max(200),
      /** One number per label of its chart. */
      values: z.array(z.number().finite()).min(1).max(LIMITS.chartLabels),
    }),
  },
  Slice: {
    positional: ["name", "value"],
    props: z.strictObject({
      name: z.string().min(1).max(200),
      value: z.number().finite().min(0),
    }),
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
/** McpMutation's arguments, in the same shape as a COMPONENTS entry (for schema exports). */
export const MCP_MUTATION = { positional: MUTATION_POSITIONAL, props: MutationProps } as const;

/**
 * Rules that span more than one prop, which a JSON description of the props can't express.
 * Keep this in step with the `.refine` calls above; other implementations code these by hand.
 */
export const CROSS_PROP_RULES = [
  { component: "Rating", rule: "When value is a number, it must not be more than max (5 when max is absent).", code: "invalid_props" },
  { component: "Input", rule: "When both are given, minLength must not be more than maxLength.", code: "invalid_props" },
] as const;

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
  /** Names of the images the app registered. When absent, no image asset is accepted. */
  assets?: readonly string[];
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

  // Images come only from the app's asset registry (never a URL).
  const asset = type === "Image" ? rest.asset : type === "ListItem" ? rest.image : undefined;
  if (typeof asset === "string" && !(ctx.assets ?? []).includes(asset)) {
    return {
      ok: false,
      issues: [{ code: "unknown_asset", message: `image "${asset}" is not in the app's asset registry`, id: raw.id }],
    };
  }

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

/** Components that hold only one kind of item, and the issue code for breaking that rule. */
export const CONTAINER_PAIRS = [
  { containers: ["List"], item: "ListItem", code: "list_mismatch" },
  { containers: ["Table"], item: "TableRow", code: "table_mismatch" },
  { containers: ["Tabs"], item: "Tab", code: "tabs_mismatch" },
  { containers: ["BarChart", "LineChart"], item: "Series", code: "chart_mismatch" },
  { containers: ["PieChart"], item: "Slice", code: "chart_mismatch" },
] as const satisfies readonly { containers: readonly ComponentType[]; item: ComponentType; code: IssueCode }[];

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
      else if (state.size >= LIMITS.stateKeys) issues.push(tooLarge(s.key));
      else state.set(s.key, s.value);
    } else if (byId.has(s.id)) {
      issues.push({ code: "duplicate_id", message: `"${s.id}" is assigned more than once`, id: s.id });
    } else if (byId.size >= LIMITS.components) {
      issues.push(tooLarge(s.id));
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

  // Inputs and Selects edit text, so their state must hold a string; DateInputs need a YYYY-MM-DD
  // date or ""; Switches need true or false.
  for (const node of nodes) {
    if (node.type !== "Input" && node.type !== "DateInput" && node.type !== "Select" && node.type !== "Switch") continue;
    const key = node.props.value.key;
    if (!state.has(key)) continue;
    const value = state.get(key);
    if ((node.type === "Input" || node.type === "Select") && typeof value !== "string") {
      issues.push({ code: "input_state_type", message: `${node.type} "${node.id}" is bound to ${key}, which is not a string`, id: node.id });
    }
    if (node.type === "Switch" && typeof value !== "boolean") {
      issues.push({ code: "input_state_type", message: `Switch "${node.id}" is bound to ${key}, which is not true or false`, id: node.id });
    }
    if (node.type === "DateInput" && !(value === "" || (typeof value === "string" && ISO_DATE.test(value)))) {
      issues.push({
        code: "input_state_type",
        message: `DateInput "${node.id}" is bound to ${key}, which is not a YYYY-MM-DD date or ""`,
        id: node.id,
      });
    }
  }

  // Containers with one kind of item: a List holds only ListItems, a Table only TableRows and Tabs
  // only Tab; each item sits only in its container. Reported on whichever line arrives second.
  for (const pair of CONTAINER_PAIRS) {
    const containers: readonly string[] = pair.containers;
    for (const node of nodes) {
      if (containers.includes(node.type)) {
        for (const child of node.children) {
          const c = byId.get(child);
          if (c?.kind === "node" && c.type !== pair.item) {
            issues.push({ code: pair.code, message: `${node.type} "${node.id}" can only contain ${pair.item}s, not ${c.type} "${child}"`, id: node.id });
          }
        }
      }
      if (node.type === pair.item) {
        const parent = parentOf.get(node.id);
        const p = parent === undefined ? undefined : byId.get(parent);
        if (p?.kind === "node" && !containers.includes(p.type)) {
          issues.push({ code: pair.code, message: `${pair.item} "${node.id}" must be inside a ${containers.join(" or ")}, not ${p.type} "${parent}"`, id: node.id });
        }
      }
    }
  }

  // A Series has one value per label of its BarChart or LineChart.
  for (const node of nodes) {
    if (node.type !== "BarChart" && node.type !== "LineChart") continue;
    for (const child of node.children) {
      const series = byId.get(child);
      if (series?.kind === "node" && series.type === "Series" && series.props.values.length !== node.props.labels.length) {
        issues.push({
          code: "chart_mismatch",
          message: `Series "${child}" has ${series.props.values.length} value(s), but ${node.type} "${node.id}" has ${node.props.labels.length} label(s)`,
          id: child,
        });
      }
    }
  }

  // A TableRow has one cell per column of its Table.
  for (const node of nodes) {
    if (node.type !== "Table") continue;
    for (const child of node.children) {
      const row = byId.get(child);
      if (row?.kind === "node" && row.type === "TableRow" && row.props.cells.length !== node.props.columns.length) {
        issues.push({
          code: "table_mismatch",
          message: `TableRow "${child}" has ${row.props.cells.length} cell(s), but Table "${node.id}" has ${node.props.columns.length} column(s)`,
          id: child,
        });
      }
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

  const root = byId.get(ROOT_ID);
  if (root === undefined) issues.push({ code: "missing_root", message: `no "${ROOT_ID} = …" line was received` });
  else if (root.kind !== "node") {
    issues.push({ code: "root_not_component", message: `"${ROOT_ID}" must be a component, not an McpMutation`, id: ROOT_ID });
  }

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

/** A line that would define a component or $state key past the document size limits [5.25]. */
function tooLarge(id: string): Issue {
  return id.startsWith("$")
    ? { code: "document_too_large", message: `a stream may declare at most ${LIMITS.stateKeys} $state keys`, id }
    : { code: "document_too_large", message: `a stream may define at most ${LIMITS.components} components, McpMutations included`, id };
}

/** The streaming rules a bound input breaks with this state value, if any. */
function inputStateIssue(node: OmniNode, value: Primitive | undefined): Issue | undefined {
  if ((node.type === "Input" || node.type === "Select") && typeof value !== "string") {
    return { code: "input_state_type", message: `${node.type} "${node.id}" is bound to ${node.props.value.key}, which is not a string`, id: node.id };
  }
  if (node.type === "Switch" && typeof value !== "boolean") {
    return { code: "input_state_type", message: `Switch "${node.id}" is bound to ${node.props.value.key}, which is not true or false`, id: node.id };
  }
  if (node.type === "DateInput" && !(value === "" || (typeof value === "string" && ISO_DATE.test(value)))) {
    return { code: "input_state_type", message: `DateInput "${node.id}" is bound to ${node.props.value.key}, which is not a YYYY-MM-DD date or ""`, id: node.id };
  }
  return undefined;
}

const isBoundInput = (node: OmniNode) => node.type === "Input" || node.type === "DateInput" || node.type === "Select" || node.type === "Switch";

/**
 * The streaming rules, checked incrementally (PLAN-HARDENING.md C.2). For a document whose statements
 * so far are consistent, `check(s)` returns exactly what `validateDocument([...added, s], { complete:
 * false })` would, but only looks at what `s` touches: its id, its children, its parent, its state
 * keys and the Button it governs. That keeps a long stream linear instead of quadratic. A test
 * compares the two on every line of thousands of fuzz streams.
 */
export class DocumentIndex {
  private readonly byId = new Map<string, OmniNode | MutationStatement>();
  private readonly state = new Map<string, Primitive>();
  /** Child id -> the defined node that lists it. */
  private readonly parentOf = new Map<string, string>();
  /** State key -> the Inputs, DateInputs, Selects and Switches bound to it. */
  private readonly boundTo = new Map<string, OmniNode[]>();
  /** Buttons that already have an McpMutation. */
  private readonly governed = new Set<string>();

  check(s: Statement): Issue[] {
    if (s.kind === "state") {
      if (this.state.has(s.key)) return [{ code: "duplicate_id", message: `${s.key} is assigned more than once`, id: s.key }];
      if (this.state.size >= LIMITS.stateKeys) return [tooLarge(s.key)];
      return (this.boundTo.get(s.key) ?? []).flatMap((node) => inputStateIssue(node, s.value) ?? []);
    }
    if (this.byId.has(s.id)) return [{ code: "duplicate_id", message: `"${s.id}" is assigned more than once`, id: s.id }];
    if (this.byId.size >= LIMITS.components) return [tooLarge(s.id)];
    return s.kind === "mutation" ? this.checkMutation(s) : this.checkNode(s);
  }

  add(s: Statement): void {
    if (s.kind === "state") {
      this.state.set(s.key, s.value);
      return;
    }
    this.byId.set(s.id, s);
    if (s.kind === "mutation") {
      this.governed.add(s.target);
      return;
    }
    for (const child of this.claimedChildren(s).claimed) this.parentOf.set(child, s.id);
    if (isBoundInput(s)) {
      const key = s.props.value.key;
      this.boundTo.set(key, [...(this.boundTo.get(key) ?? []), s]);
    }
  }

  private checkMutation(m: MutationStatement): Issue[] {
    const issues: Issue[] = [];
    // A node listed this id as a child before it arrived; now it turns out to be an McpMutation.
    const lister = this.parentOf.get(m.id);
    if (lister !== undefined) issues.push({ code: "child_not_component", message: `"${m.id}" is an McpMutation, not a component`, id: lister });
    if (this.governed.has(m.target)) {
      const existing = [...this.byId.values()].find((x) => x.kind === "mutation" && x.target === m.target);
      issues.push({ code: "duplicate_mutation", message: `"${m.target}" is already governed by "${existing?.id ?? "another McpMutation"}"`, id: m.id });
    }
    return issues;
  }

  /** The tree-shape rules for a new node's children list, as validateDocument applies them. */
  private claimedChildren(node: OmniNode): { claimed: string[]; issues: Issue[] } {
    const issues: Issue[] = [];
    const claimed: string[] = [];
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
      if (this.byId.get(child)?.kind === "mutation") {
        issues.push({ code: "child_not_component", message: `"${child}" is an McpMutation, not a component`, id: node.id });
        continue;
      }
      const existing = this.parentOf.get(child);
      if (existing !== undefined) {
        issues.push({
          code: "multiple_parents",
          message: `"${child}" already belongs to "${existing}" and cannot also be a child of "${node.id}"`,
          id: node.id,
        });
        continue;
      }
      claimed.push(child);
    }
    return { claimed, issues };
  }

  private checkNode(node: OmniNode): Issue[] {
    const { claimed, issues } = this.claimedChildren(node);
    const parentOf = (id: string) => (claimed.includes(id) ? node.id : this.parentOf.get(id));
    const lookup = (id: string) => (id === node.id ? node : this.byId.get(id));

    // Cycles: every new edge starts at this node, so a cycle exists only if one of its new children
    // is the node itself or one of its ancestors.
    const ancestors = new Set<string>([node.id]);
    for (let p = this.parentOf.get(node.id); p !== undefined && !ancestors.has(p); p = this.parentOf.get(p)) ancestors.add(p);
    if (claimed.some((child) => ancestors.has(child))) {
      issues.push({ code: "cycle", message: `"${node.id}" contains itself through its children`, id: node.id });
    }

    if (isBoundInput(node) && this.state.has(node.props.value.key)) {
      const issue = inputStateIssue(node, this.state.get(node.props.value.key));
      if (issue) issues.push(issue);
    }

    // Containers with one kind of item, seen from the new node as a container, as an item, and as the
    // new parent of items it claims.
    const parent = parentOf(node.id);
    const parentNode = parent === undefined ? undefined : lookup(parent);
    for (const pair of CONTAINER_PAIRS) {
      const containers: readonly string[] = pair.containers;
      if (containers.includes(node.type)) {
        for (const child of node.children) {
          const c = lookup(child);
          if (c?.kind === "node" && c.type !== pair.item) {
            issues.push({ code: pair.code, message: `${node.type} "${node.id}" can only contain ${pair.item}s, not ${c.type} "${child}"`, id: node.id });
          }
        }
      }
      if (parentNode?.kind === "node" && parentNode.id !== node.id && containers.includes(parentNode.type) && node.type !== pair.item) {
        issues.push({ code: pair.code, message: `${parentNode.type} "${parentNode.id}" can only contain ${pair.item}s, not ${node.type} "${node.id}"`, id: parentNode.id });
      }
      if (node.type === pair.item && parentNode?.kind === "node" && !containers.includes(parentNode.type)) {
        issues.push({ code: pair.code, message: `${pair.item} "${node.id}" must be inside a ${containers.join(" or ")}, not ${parentNode.type} "${parent}"`, id: node.id });
      }
      for (const child of claimed) {
        const c = this.byId.get(child);
        if (c?.kind === "node" && c.type === pair.item && !containers.includes(node.type)) {
          issues.push({ code: pair.code, message: `${pair.item} "${child}" must be inside a ${containers.join(" or ")}, not ${node.type} "${node.id}"`, id: child });
        }
      }
    }

    // A Series has one value per label of its chart; a TableRow one cell per column of its Table.
    const seriesIssue = (chart: OmniNode, series: OmniNode): Issue | undefined =>
      (chart.type === "BarChart" || chart.type === "LineChart") && series.type === "Series" && series.props.values.length !== chart.props.labels.length
        ? {
            code: "chart_mismatch",
            message: `Series "${series.id}" has ${series.props.values.length} value(s), but ${chart.type} "${chart.id}" has ${chart.props.labels.length} label(s)`,
            id: series.id,
          }
        : undefined;
    const rowIssue = (table: OmniNode, row: OmniNode): Issue | undefined =>
      table.type === "Table" && row.type === "TableRow" && row.props.cells.length !== table.props.columns.length
        ? {
            code: "table_mismatch",
            message: `TableRow "${row.id}" has ${row.props.cells.length} cell(s), but Table "${table.id}" has ${table.props.columns.length} column(s)`,
            id: row.id,
          }
        : undefined;
    for (const child of node.children) {
      const c = lookup(child);
      if (c?.kind === "node") {
        const issue = seriesIssue(node, c) ?? rowIssue(node, c);
        if (issue) issues.push(issue);
      }
    }
    if (parentNode?.kind === "node" && parentNode.id !== node.id && parentNode.children.includes(node.id)) {
      const issue = seriesIssue(parentNode, node) ?? rowIssue(parentNode, node);
      if (issue) issues.push(issue);
    }

    return issues;
  }
}
