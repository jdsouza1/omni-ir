// The neutral screen structure every format is converted from (PLAN-COMPARISON.md, B).
// A screen is a list of statements in the order its source wrote them, so formats that stream
// can be emitted in the same order. Components refer to each other by id, as in Omni-IR,
// OpenUI Lang, A2UI and json-render.

export type Value = string | number | boolean | null | Value[] | Ref | StateRef | Obj;
/** A reference to another component (or, in OpenUI Lang, to a named value). */
export interface Ref { kind: "ref"; id: string }
export interface StateRef { kind: "state"; key: string }
export interface Obj { kind: "object"; entries: [string, Value][] }

export interface NodeStmt {
  kind: "node";
  id: string;
  type: string;
  /** Props in the catalog's order. Children are Ref values. */
  props: [string, Value][];
  /** True when the source wrote this component inline inside another; its id was generated. */
  inline?: boolean;
}
export interface StateStmt { kind: "state"; key: string; value: Value }
/** A governed action: the tool a Button calls and its params (Omni-IR's McpMutation). */
export interface MutationStmt { kind: "mutation"; id: string; target: string; tool: string; params: [string, Value][] }
/** OpenUI Lang lets a statement name a plain value (`cols = [Col(...), ...]`); other formats inline it. */
export interface ValueStmt { kind: "value"; id: string; value: Value }

export type Stmt = NodeStmt | StateStmt | MutationStmt | ValueStmt;

export interface Screen {
  /** File name without extension, e.g. "booking". */
  name: string;
  set: ScreenSet;
  catalog: Catalog;
  stmts: Stmt[];
}

export type ScreenSet = "omni" | "openui";

/** What a converter needs to know about a component library. */
export interface Catalog {
  name: string;
  /** Every prop of a component, in the library's documented order. */
  props(type: string): readonly string[];
  /** The props Omni-IR syntax writes positionally (Omni-IR's own catalog says; others: the first prop). */
  positional(type: string): readonly string[];
  /** Layout containers: they don't count as content in the streaming measurement. */
  isLayout(type: string): boolean;
  /** Props that two-way bind state (inputs), as opposed to reading it. */
  isBinding(type: string, prop: string): boolean;
}

export const ref = (id: string): Ref => ({ kind: "ref", id });
export const isRef = (v: Value): v is Ref => typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "ref";
export const isState = (v: Value): v is StateRef => typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "state";
export const isObj = (v: Value): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "object";

export function nodes(screen: Screen): NodeStmt[] {
  return screen.stmts.filter((s): s is NodeStmt => s.kind === "node");
}

export function mutationFor(screen: Screen, id: string): MutationStmt | undefined {
  return screen.stmts.find((s): s is MutationStmt => s.kind === "mutation" && s.target === id);
}

/** Replace references to named values (OpenUI Lang's `cols = [...]`) with the values themselves. */
export function resolveValues(screen: Screen, value: Value): Value {
  const named = new Map(screen.stmts.filter((s): s is ValueStmt => s.kind === "value").map((s) => [s.id, s.value]));
  const walk = (v: Value): Value => {
    if (Array.isArray(v)) return v.map(walk);
    if (isRef(v) && named.has(v.id)) return walk(named.get(v.id) as Value);
    if (isObj(v)) return { kind: "object", entries: v.entries.map(([k, x]) => [k, walk(x)]) };
    return v;
  };
  return walk(value);
}

/** Ids of the components a value refers to, in order (after resolving named values). */
export function refsIn(value: Value): string[] {
  if (Array.isArray(value)) return value.flatMap(refsIn);
  if (isRef(value)) return [value.id];
  if (isObj(value)) return value.entries.flatMap(([, v]) => refsIn(v));
  return [];
}

/** The id of each component's parent, from the root down. */
export function parents(screen: Screen): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of nodes(screen)) {
    for (const [, v] of n.props) for (const child of refsIn(resolveValues(screen, v))) if (!out.has(child)) out.set(child, n.id);
  }
  return out;
}

export const ROOT = "root";
