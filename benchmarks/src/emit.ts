// Screen → each format. Every emitter keeps the screen's own components and props and changes
// only the syntax (OpenUI's benchmark converts its samples the same way). Each one also records
// where in its output every component has fully arrived, for the streaming measurement.
import { isObj, isRef, isState, mutationFor, nodes, refsIn, resolveValues, ROOT, type MutationStmt, type NodeStmt, type Screen, type Value } from "./tree";

export interface Emitted {
  text: string;
  /** Character offset at which each component has fully arrived and can be drawn by itself. */
  arrivals: Map<string, number>;
}

export interface Format {
  id: string;
  label: string;
  ext: string;
  /** Formats that only make sense for one catalog (HTML needs a template per component). */
  sets?: readonly Screen["set"][];
  emit(screen: Screen): Emitted;
}

/** Builds line-oriented output and records when each component's line is complete. */
class Lines {
  text = "";
  arrivals = new Map<string, number>();
  add(line: string, ...ids: string[]) {
    this.text += line + "\n";
    for (const id of ids) this.arrivals.set(id, this.text.length);
  }
  done(): Emitted {
    return { text: this.text, arrivals: this.arrivals };
  }
}

const stateName = (key: string) => key.slice(1);
const quote = (s: string) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';

function nodeMap(screen: Screen): Map<string, NodeStmt> {
  return new Map(nodes(screen).map((n) => [n.id, n]));
}

// ---------------------------------------------------------------------------
// Omni-IR: one flat statement per line, the leading props positional, the rest named.

function omniValue(v: Value): string {
  if (v === null) return "null";
  if (typeof v === "string") return quote(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(omniValue).join(", ")}]`;
  if (isRef(v)) return v.id;
  if (isState(v)) return v.key;
  return `{${v.entries.map(([k, x]) => `${k}: ${omniValue(x)}`).join(", ")}}`;
}

export const OMNI: Format = {
  id: "omni-ir",
  label: "Omni-IR",
  ext: "omni",
  emit(screen) {
    const out = new Lines();
    for (const s of screen.stmts) {
      if (s.kind === "state") out.add(`${s.key} = ${omniValue(s.value)}`);
      else if (s.kind === "mutation") {
        const params = s.params.length ? `, params=${omniValue({ kind: "object", entries: s.params })}` : "";
        out.add(`${s.id} = McpMutation(${s.target}, tool=${quote(s.tool)}${params})`);
      } else if (s.kind === "node") {
        const positional = screen.catalog.positional(s.type);
        const args: string[] = [];
        const pos = new Set<string>();
        for (const p of positional) {
          const entry = s.props.find(([k]) => k === p);
          if (!entry) break;
          pos.add(p);
          args.push(omniValue(resolveValues(screen, entry[1])));
        }
        for (const [k, v] of s.props) if (!pos.has(k)) args.push(`${k}=${omniValue(resolveValues(screen, v))}`);
        out.add(`${s.id} = ${s.type}(${args.join(", ")})`, s.id);
      }
      // Named values (OpenUI Lang) are written inline where they are used.
    }
    return out.done();
  },
};

// ---------------------------------------------------------------------------
// OpenUI Lang: positional arguments in the component's documented order, `$variables`,
// Mutation(...) run from a Button through Action([@Run(...)]); inline components stay inline.

export const OPENUI: Format = {
  id: "openui-lang",
  label: "OpenUI Lang",
  ext: "oui",
  emit(screen) {
    const byId = nodeMap(screen);
    const out = new Lines();
    const call = (n: NodeStmt): string => {
      const order = screen.catalog.props(n.type);
      const mutation = mutationFor(screen, n.id);
      const values = new Map(n.props);
      if (mutation) values.set("action", { kind: "ref", id: `\u0000run:${mutation.id}` });
      let last = -1;
      order.forEach((p, i) => values.has(p) && (last = i));
      const args = order.slice(0, last + 1).map((p) => (values.has(p) ? value(values.get(p) as Value) : "null"));
      return `${n.type}(${args.join(", ")})`;
    };
    const value = (v: Value): string => {
      if (isRef(v)) {
        if (v.id.startsWith("\u0000run:")) return `Action([@Run(${v.id.slice(5)})])`;
        const target = byId.get(v.id);
        return target?.inline ? call(target) : v.id;
      }
      if (Array.isArray(v)) return `[${v.map(value).join(", ")}]`;
      if (isObj(v)) return `{${v.entries.map(([k, x]) => `${k}: ${value(x)}`).join(", ")}}`;
      return omniValue(v);
    };
    // An inline component arrives with the statement that contains it.
    const inlineIds = (v: Value): string[] =>
      refsIn(v).flatMap((id) => {
        const n = byId.get(id);
        return n?.inline ? [id, ...n.props.flatMap(([, x]) => inlineIds(x))] : [];
      });
    for (const s of screen.stmts) {
      if (s.kind === "state") out.add(`${s.key} = ${value(s.value)}`);
      else if (s.kind === "mutation") out.add(`${s.id} = Mutation(${quote(s.tool)}, ${value({ kind: "object", entries: s.params })})`);
      else if (s.kind === "value") out.add(`${s.id} = ${value(s.value)}`, ...inlineIds(s.value));
      else if (!s.inline) out.add(`${s.id} = ${call(s)}`, s.id, ...s.props.flatMap(([, x]) => inlineIds(x)));
    }
    // Named values arrive with their statement; components inside them arrive then too.
    return out.done();
  },
};

// ---------------------------------------------------------------------------
// JSON formats

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function jsonValue(v: Value, state: (s: { key: string }) => Json): Json {
  if (Array.isArray(v)) return v.map((x) => jsonValue(x, state));
  if (isRef(v)) return v.id;
  if (isState(v)) return state(v);
  if (isObj(v)) return Object.fromEntries(v.entries.map(([k, x]) => [k, jsonValue(x, state)]));
  return v;
}

/** Splits a component's props into child ids and other props (json-render keeps children apart). */
function splitChildren(screen: Screen, n: NodeStmt): { children: string[]; props: [string, Value][] } {
  const children: string[] = [];
  const props: [string, Value][] = [];
  for (const [k, raw] of n.props) {
    const v = resolveValues(screen, raw);
    const isRefList = isRef(v) || (Array.isArray(v) && v.length > 0 && v.every(isRef));
    if (isRefList) children.push(...refsIn(v));
    else props.push([k, v]);
  }
  return { children, props };
}

const dataModel = (screen: Screen): Record<string, Json> =>
  Object.fromEntries(screen.stmts.flatMap((s) => (s.kind === "state" ? [[stateName(s.key), jsonValue(s.value, () => null)]] : [])));

// A2UI v0.9: JSON Lines messages. Components are a flat list referring to children by id; values
// bound to the data model are {"path": "/key"}; a governed button's action is a server event.
function a2uiComponent(screen: Screen, n: NodeStmt, mutation: MutationStmt | undefined): Json {
  const out: Record<string, Json> = { id: n.id, component: n.type };
  const path = (s: { key: string }) => ({ path: `/${stateName(s.key)}` });
  for (const [k, v] of n.props) {
    if (mutation && k === "action") continue;
    // A2UI actions are objects: a plain action name becomes a server event.
    out[k] = k === "action" && typeof v === "string" ? { event: { name: v } } : jsonValue(resolveValues(screen, v), path);
  }
  if (mutation) out.action = { event: { name: mutation.tool, context: Object.fromEntries(mutation.params.map(([k, v]) => [k, jsonValue(v, path)])) } };
  return out;
}

function a2ui(perComponent: boolean): Format["emit"] {
  return (screen) => {
    const out = new Lines();
    const surfaceId = screen.name;
    const msg = (body: Record<string, Json>) => JSON.stringify({ version: "v0.9", ...body });
    out.add(msg({ createSurface: { surfaceId, catalogId: `https://example.com/catalogs/${screen.set === "omni" ? "omni-ir" : "openui"}.json` } }));
    const components = nodes(screen).map((n) => ({ id: n.id, json: a2uiComponent(screen, n, mutationFor(screen, n.id)) }));
    if (perComponent) {
      // Streamed: each state value and each component in its own message, in source order.
      for (const s of screen.stmts) {
        if (s.kind === "state") out.add(msg({ updateDataModel: { surfaceId, path: `/${stateName(s.key)}`, value: jsonValue(s.value, () => null) } }));
        if (s.kind === "node") out.add(msg({ updateComponents: { surfaceId, components: [components.find((c) => c.id === s.id)?.json ?? null] } }), s.id);
      }
    } else {
      const model = dataModel(screen);
      if (Object.keys(model).length) out.add(msg({ updateDataModel: { surfaceId, value: model } }));
      out.add(msg({ updateComponents: { surfaceId, components: components.map((c) => c.json) } }), ...components.map((c) => c.id));
    }
    return out.done();
  };
}

export const A2UI_BATCHED: Format = { id: "a2ui", label: "A2UI v0.9", ext: "a2ui.jsonl", emit: a2ui(false) };
export const A2UI_STREAMED: Format = { id: "a2ui-streamed", label: "A2UI v0.9 (one message per component)", ext: "a2ui-streamed.jsonl", emit: a2ui(true) };

// json-render: a stream of JSON Patch operations building {root, elements, state}. Input values
// are {"$bindState": "/key"}, values read from state {"$state": "/key"}; a governed button
// has on.press bound to the tool.
export const JSON_RENDER: Format = {
  id: "json-render",
  label: "json-render",
  ext: "jsonr.jsonl",
  emit(screen) {
    const out = new Lines();
    const op = (path: string, value: Json) => JSON.stringify({ op: "add", path, value });
    out.add(op("/root", ROOT));
    for (const s of screen.stmts) {
      if (s.kind === "state") out.add(op(`/state/${stateName(s.key)}`, jsonValue(s.value, () => null)));
      if (s.kind !== "node") continue;
      const { children, props } = splitChildren(screen, s);
      const mutation = mutationFor(screen, s.id);
      const p: Record<string, Json> = {};
      for (const [k, v] of props) {
        if (mutation && k === "action") continue;
        p[k] = jsonValue(v, (st): Json => (screen.catalog.isBinding(s.type, k) ? { $bindState: `/${stateName(st.key)}` } : { $state: `/${stateName(st.key)}` }));
      }
      const element: Record<string, Json> = { type: s.type, props: p, children };
      if (mutation) {
        element.on = {
          press: { action: mutation.tool, params: Object.fromEntries(mutation.params.map(([k, v]) => [k, jsonValue(v, (st) => ({ $state: `/${stateName(st.key)}` }))])) },
        };
      }
      out.add(op(`/elements/${s.id}`, element), s.id);
    }
    return out.done();
  },
};

/**
 * json-render as OpenUI's benchmark wrote it (ids `type-N` numbered top-down, components emitted
 * children first), used only to check this converter against OpenUI's published files.
 */
export function jsonRenderOpenUIStyle(screen: Screen): string {
  const byId = nodeMap(screen);
  const ids = new Map<string, string>();
  let counter = 0;
  const number = (id: string) => {
    const n = byId.get(id);
    if (!n || ids.has(id)) return;
    ids.set(id, `${n.type.toLowerCase()}-${++counter}`);
    for (const child of splitChildren(screen, n).children) number(child);
  };
  number(ROOT);
  const lines = [JSON.stringify({ op: "add", path: "/root", value: ids.get(ROOT) })];
  const visit = (id: string) => {
    const n = byId.get(id) as NodeStmt;
    const { children, props } = splitChildren(screen, n);
    for (const c of children) visit(c);
    const value = { type: n.type, props: Object.fromEntries(props.map(([k, v]) => [k, jsonValue(v, () => null)])), children: children.map((c) => ids.get(c) ?? c) };
    lines.push(JSON.stringify({ op: "add", path: `/elements/${ids.get(id)}`, value }));
  };
  visit(ROOT);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// React JSX: a component a model would write against the same component library. It can only be
// shown once the whole module has arrived and compiled.

function jsxAttr(v: Value, expr: (v: Value) => string): string {
  if (typeof v === "string" && !/["{}<>\n]/.test(v)) return `"${v}"`;
  return `{${expr(v)}}`;
}

export const JSX: Format = {
  id: "jsx",
  label: "React JSX",
  ext: "jsx",
  emit(screen) {
    const byId = nodeMap(screen);
    const expr = (v: Value): string => {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return `[${v.map(expr).join(", ")}]`;
      if (isRef(v)) return inlineElement(v.id);
      if (isState(v)) return stateName(v.key);
      return `{ ${v.entries.map(([k, x]) => `${k}: ${expr(x)}`).join(", ")} }`;
    };
    const attrsOf = (n: NodeStmt, skip: Set<string>): string[] => {
      const mutation = mutationFor(screen, n.id);
      const attrs: string[] = [];
      for (const [k, raw] of n.props) {
        if (skip.has(k) || (mutation && k === "action")) continue;
        const v = resolveValues(screen, raw);
        if (isState(v) && screen.catalog.isBinding(n.type, k)) {
          const name = stateName(v.key);
          attrs.push(`${k}={${name}}`, `onChange={set${name.charAt(0).toUpperCase()}${name.slice(1)}}`);
        } else attrs.push(`${k}=${jsxAttr(v, expr)}`);
      }
      if (mutation) {
        const params = mutation.params.map(([k, v]) => (isState(v) && stateName(v.key) === k ? k : `${k}: ${expr(v)}`)).join(", ");
        attrs.push(`onClick={() => callTool(${JSON.stringify(mutation.tool)}, { ${params} })}`);
      }
      return attrs;
    };
    // The main slot (children, or the first prop holding components) becomes JSX children;
    // a leading text prop of a component without children becomes its text.
    const slots = (n: NodeStmt) => {
      const childProp = n.props.find(([k, v]) => k === "children" || refsIn(resolveValues(screen, v)).length > 0)?.[0];
      const first = n.props[0];
      const textProp =
        childProp === undefined && first && screen.catalog.positional(n.type)[0] === first[0] && (typeof first[1] === "string" || isState(first[1])) && !screen.catalog.isBinding(n.type, first[0])
          ? first[0]
          : undefined;
      return { childProp, textProp };
    };
    const open = (n: NodeStmt, skip: Set<string>) => {
      const attrs = attrsOf(n, skip);
      return `${n.type}${attrs.length ? " " + attrs.join(" ") : ""}`;
    };
    const inlineElement = (id: string): string => {
      const n = byId.get(id);
      if (!n) return id;
      const { childProp, textProp } = slots(n);
      const skip = new Set([childProp, textProp].filter((x): x is string => !!x));
      const inner = childProp ? refsIn(resolveValues(screen, n.props.find(([k]) => k === childProp)?.[1] ?? null)).map(inlineElement).join("") : textProp ? text(n, textProp) : "";
      return inner ? `<${open(n, skip)}>${inner}</${n.type}>` : `<${open(n, skip)} />`;
    };
    const text = (n: NodeStmt, prop: string) => {
      const v = n.props.find(([k]) => k === prop)?.[1] ?? "";
      if (isState(v)) return `{${stateName(v.key)}}`;
      return /[{}<>]/.test(String(v)) ? `{${JSON.stringify(v)}}` : String(v);
    };
    const lines: string[] = [];
    const element = (id: string, depth: number) => {
      const pad = "  ".repeat(depth);
      const n = byId.get(id);
      if (!n) return;
      const { childProp, textProp } = slots(n);
      const skip = new Set([childProp, textProp].filter((x): x is string => !!x));
      if (childProp) {
        lines.push(`${pad}<${open(n, skip)}>`);
        for (const c of refsIn(resolveValues(screen, n.props.find(([k]) => k === childProp)?.[1] ?? null))) element(c, depth + 1);
        lines.push(`${pad}</${n.type}>`);
      } else if (textProp) lines.push(`${pad}<${open(n, skip)}>${text(n, textProp)}</${n.type}>`);
      else lines.push(`${pad}<${open(n, skip)} />`);
    };
    element(ROOT, 2);
    const used = [...new Set(nodes(screen).map((n) => n.type))].sort();
    const head = [
      ...(screen.stmts.some((s) => s.kind === "state") ? [`import { useState } from "react";`] : []),
      `import { ${used.join(", ")} } from "@/components/ui";`,
      ...(screen.stmts.some((s) => s.kind === "mutation") ? [`import { callTool } from "@/lib/tools";`] : []),
      "",
      "export default function Screen() {",
      ...screen.stmts.flatMap((s) => {
        if (s.kind !== "state") return [];
        const name = stateName(s.key);
        return [`  const [${name}, set${name.charAt(0).toUpperCase()}${name.slice(1)}] = useState(${expr(s.value)});`];
      }),
      "  return (",
    ];
    const text_ = [...head, ...lines, "  );", "}", ""].join("\n");
    return { text: text_, arrivals: new Map(nodes(screen).map((n) => [n.id, text_.length])) };
  },
};
