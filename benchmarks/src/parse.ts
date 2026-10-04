// Source formats → Screen. Omni-IR is read with Omni-IR's own tokenizer; OpenUI Lang with a
// small parser for its documented syntax (positional arguments, nested calls, named values,
// `$variables`, Mutation and Action).
import { parseLine, type RawValue } from "@omni-ir/core";
import type { Catalog, NodeStmt, Screen, ScreenSet, Stmt, Value } from "./tree";

// ---------------------------------------------------------------------------
// Omni-IR

export function parseOmni(name: string, set: ScreenSet, catalog: Catalog, text: string): Screen {
  const stmts: Stmt[] = [];
  text.split("\n").forEach((line, i) => {
    const parsed = parseLine(line);
    if (parsed.kind === "empty") return;
    if (parsed.kind === "error") throw new Error(`${name}:${i + 1}: ${parsed.issues.map((x) => x.message).join("; ")}`);
    const raw = parsed.statement;
    if (raw.kind === "state") {
      stmts.push({ kind: "state", key: raw.key, value: fromRaw(raw.value) });
      return;
    }
    const positional = catalog.positional(raw.callee);
    const given = new Map<string, Value>();
    raw.args.forEach((arg, j) => {
      const prop = positional[j];
      if (prop === undefined) throw new Error(`${name}:${i + 1}: too many positional arguments for ${raw.callee}`);
      given.set(prop, fromRaw(arg));
    });
    for (const [k, v] of raw.named) given.set(k, fromRaw(v));
    if (raw.callee === "McpMutation") {
      const target = given.get("target");
      const params = given.get("params");
      if (typeof target !== "object" || target === null || Array.isArray(target) || target.kind !== "ref") throw new Error(`${name}:${i + 1}: McpMutation target`);
      stmts.push({
        kind: "mutation",
        id: raw.id,
        target: target.id,
        tool: String(given.get("tool")),
        params: params && typeof params === "object" && !Array.isArray(params) && params.kind === "object" ? params.entries : [],
      });
      return;
    }
    stmts.push({ kind: "node", id: raw.id, type: raw.callee, props: ordered(catalog, raw.callee, given) });
  });
  return { name, set, catalog, stmts };
}

function fromRaw(v: RawValue): Value {
  switch (v.kind) {
    case "string":
    case "number":
    case "boolean":
      return v.value;
    case "null":
      return null;
    case "ident":
      return { kind: "ref", id: v.name };
    case "state":
      return { kind: "state", key: v.key };
    case "array":
      return v.items.map(fromRaw);
    case "object":
      return { kind: "object", entries: v.entries.map(([k, x]) => [k, fromRaw(x)]) };
    case "call":
      throw new Error(`nested call ${v.callee}: not Omni-IR syntax`);
  }
}

function ordered(catalog: Catalog, type: string, given: Map<string, Value>): [string, Value][] {
  const order = catalog.props(type);
  for (const k of given.keys()) if (!order.includes(k)) throw new Error(`${type} has no prop ${k} in ${catalog.name}`);
  return order.filter((k) => given.has(k)).map((k) => [k, given.get(k) as Value]);
}

// ---------------------------------------------------------------------------
// OpenUI Lang

type Expr =
  | { t: "lit"; v: string | number | boolean | null }
  | { t: "ident"; name: string }
  | { t: "state"; key: string }
  | { t: "array"; items: Expr[] }
  | { t: "object"; entries: [string, Expr][] }
  | { t: "call"; callee: string; args: Expr[] };

export function parseOpenUILang(name: string, set: ScreenSet, catalog: Catalog, text: string): Screen {
  const stmts: Stmt[] = [];
  const counters = new Map<string, number>();
  // Mutation(...) statements, and the Button each one is run from.
  const runFrom = new Map<string, string>();

  const lower = (expr: Expr, owner: { id: string; inline: Stmt[] }): Value => {
    switch (expr.t) {
      case "lit":
        return expr.v;
      case "ident":
        return { kind: "ref", id: expr.name };
      case "state":
        return { kind: "state", key: expr.key };
      case "array":
        return expr.items.map((x) => lower(x, owner));
      case "object":
        return { kind: "object", entries: expr.entries.map(([k, x]) => [k, lower(x, owner)]) };
      case "call": {
        // An inline component gets a generated id and its own statement, placed after its parent's.
        const n = (counters.get(expr.callee) ?? 0) + 1;
        counters.set(expr.callee, n);
        const id = `${expr.callee.charAt(0).toLowerCase()}${expr.callee.slice(1)}${n}`;
        const inner: { id: string; inline: Stmt[] } = { id, inline: [] };
        const node = callToNode(id, expr, inner);
        owner.inline.push({ ...node, inline: true }, ...inner.inline);
        return { kind: "ref", id };
      }
    }
  };

  const callToNode = (id: string, call: Extract<Expr, { t: "call" }>, owner: { id: string; inline: Stmt[] }): NodeStmt => {
    const order = catalog.props(call.callee);
    const props: [string, Value][] = [];
    call.args.forEach((arg, j) => {
      const prop = order[j];
      if (prop === undefined) throw new Error(`${name}: too many arguments for ${call.callee}`);
      // Action([@Run(m)]) in a Button's action slot: the Button runs Mutation m.
      if (arg.t === "call" && arg.callee === "Action") {
        const run = arg.args[0]?.t === "array" ? arg.args[0].items[0] : undefined;
        if (run?.t === "call" && run.callee === "@Run" && run.args[0]?.t === "ident") runFrom.set(run.args[0].name, id);
        return;
      }
      if (arg.t === "lit" && arg.v === null) return; // a skipped optional argument
      props.push([prop, lower(arg, owner)]);
    });
    return { kind: "node", id, type: call.callee, props };
  };

  statementsOf(text).forEach(({ text: trimmed, line: i }) => {
    const m = /^(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(trimmed);
    if (!m) throw new Error(`${name}:${i + 1}: not a statement`);
    const lhs = m[1] as string;
    const expr = new ExprParser(trimmed.slice(m[0].length), `${name}:${i + 1}`).parseAll();
    const owner = { id: lhs, inline: [] as Stmt[] };
    if (lhs.startsWith("$")) {
      stmts.push({ kind: "state", key: lhs, value: lower(expr, owner) }, ...owner.inline);
    } else if (expr.t === "call" && expr.callee === "Mutation") {
      const [tool, params] = expr.args;
      if (tool?.t !== "lit" || typeof tool.v !== "string") throw new Error(`${name}:${i + 1}: Mutation tool`);
      const p = params ? lower(params, owner) : null;
      stmts.push({ kind: "mutation", id: lhs, target: "", tool: tool.v, params: p && typeof p === "object" && !Array.isArray(p) && p.kind === "object" ? p.entries : [] });
    } else if (expr.t === "call") {
      stmts.push(callToNode(lhs, expr, owner), ...owner.inline);
    } else {
      stmts.push({ kind: "value", id: lhs, value: lower(expr, owner) }, ...owner.inline);
    }
  });
  for (const s of stmts) {
    if (s.kind !== "mutation") continue;
    const target = runFrom.get(s.id);
    if (!target) throw new Error(`${name}: Mutation ${s.id} is never run`);
    s.target = target;
  }
  return { name, set, catalog, stmts };
}

/** OpenUI Lang statements: one per line, continuing onto the next lines while a bracket is open. */
export function statementsOf(text: string): { text: string; line: number; end: number }[] {
  const out: { text: string; line: number; end: number }[] = [];
  let buf = "";
  let start = 0;
  let depth = 0;
  let offset = 0;
  text.split("\n").forEach((line, i) => {
    offset += line.length + 1;
    if (buf === "" && (line.trim() === "" || line.trim().startsWith("//"))) return;
    if (buf === "") start = i;
    buf += (buf ? " " : "") + line.trim();
    let inString = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (inString) {
        if (c === "\\") j++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
    }
    if (depth <= 0) {
      out.push({ text: buf, line: start, end: Math.min(offset, text.length) });
      buf = "";
      depth = 0;
    }
  });
  if (buf) out.push({ text: buf, line: start, end: text.length });
  return out;
}

class ExprParser {
  private i = 0;
  constructor(private readonly s: string, private readonly where: string) {}

  parseAll(): Expr {
    const e = this.expr();
    this.ws();
    if (this.i !== this.s.length) this.fail("unexpected text");
    return e;
  }

  private fail(msg: string): never {
    throw new Error(`${this.where} col ${this.i + 1}: ${msg}`);
  }
  private ws() {
    while (this.s[this.i] === " " || this.s[this.i] === "\t") this.i++;
  }
  private eat(c: string) {
    this.ws();
    if (this.s[this.i] !== c) this.fail(`expected ${c}`);
    this.i++;
  }
  private list<T>(close: string, item: () => T): T[] {
    const out: T[] = [];
    this.ws();
    if (this.s[this.i] === close) {
      this.i++;
      return out;
    }
    for (;;) {
      out.push(item());
      this.ws();
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      this.eat(close);
      return out;
    }
  }

  private expr(): Expr {
    this.ws();
    const c = this.s[this.i];
    if (c === '"') return { t: "lit", v: this.string() };
    if (c === "[") {
      this.i++;
      return { t: "array", items: this.list("]", () => this.expr()) };
    }
    if (c === "{") {
      this.i++;
      return {
        t: "object",
        entries: this.list("}", () => {
          this.ws();
          const key = this.s[this.i] === '"' ? this.string() : this.word();
          this.eat(":");
          return [key, this.expr()] as [string, Expr];
        }),
      };
    }
    const num = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (num) {
      this.i += num[0].length;
      return { t: "lit", v: Number(num[0]) };
    }
    const word = this.word();
    if (word === "true" || word === "false") return { t: "lit", v: word === "true" };
    if (word === "null") return { t: "lit", v: null };
    if (word.startsWith("$")) return { t: "state", key: word };
    this.ws();
    if (this.s[this.i] === "(") {
      this.i++;
      return { t: "call", callee: word, args: this.list(")", () => this.expr()) };
    }
    return { t: "ident", name: word };
  }

  private word(): string {
    const m = /^[@$]?[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
    if (!m) this.fail("expected a name or value");
    this.i += m[0].length;
    return m[0];
  }

  private string(): string {
    this.i++; // opening quote
    let out = "";
    for (;;) {
      const c = this.s[this.i++];
      if (c === undefined) this.fail("unterminated string");
      if (c === '"') return out;
      if (c === "\\") {
        const e = this.s[this.i++];
        out += e === "n" ? "\n" : e === "t" ? "\t" : e === "u" ? String.fromCharCode(parseInt(this.s.slice(this.i, (this.i += 4)), 16)) : (e ?? "");
      } else out += c;
    }
  }
}
