// Catalog conformance cases, generated from conformance/schema.json (the language-neutral export
// of the schema, the same data as SPEC.md section 6). For every component and prop: lines that
// must be accepted, with the props they must produce, and lines that must be rejected with
// `invalid_props` (a wrong type or value, out of range, too long, a missing required prop, an
// unknown prop, an extra positional argument).
//
// Expected results come from the schema's definitions through the small JSON Schema checker
// below, never from running the parser. A pattern without a sample here stops the build, so a
// new kind of prop gets samples chosen by a person.
import { readFileSync } from "node:fs";
import type { ConformanceCase, InputPart } from "./build";

interface Def {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Def[];
  properties?: Record<string, Def>;
  required?: string[];
  items?: Def;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
}
interface ComponentShape {
  positional: string[];
  props: Def;
}

/** A value as written in Omni-IR, and its canonical form in a case's expected nodes. */
interface Sample {
  src: InputPart[];
  value: unknown;
}

const STATE_KEY = "$s";
const ASSETS = ["cabin-pines"];

// Valid and invalid examples for each string pattern in the schema.
const PATTERNS: Record<string, { valid: string; invalid: string }> = {
  "^[a-z][A-Za-z0-9_]*$": { valid: "pay", invalid: "Pay now" },
  "^[A-Z]{3}$": { valid: "EUR", invalid: "euro" },
  "^[a-z0-9][a-z0-9-]*$": { valid: "cabin-pines", invalid: "https://tracker.example/pixel.gif" },
  "^\\d{4}-\\d{2}-\\d{2}$": { valid: "2026-10-14", invalid: "14/10/2026" },
};

const text = (s: string): Sample => ({ src: [JSON.stringify(s)], value: s });
const num = (n: number): Sample => ({ src: [String(n)], value: n });
const STATE: Sample = { src: [STATE_KEY], value: { state: STATE_KEY } };
const EMPTY_LIST: Sample = { src: ["[]"], value: [] };

const isStateRef = (d: Def) => d.type === "object" && d.properties?.kind?.const === "state";
const isRefList = (d: Def) => d.type === "array" && d.items?.properties?.kind?.const === "ref";

/** Does the JSON Schema definition accept this canonical value? Covers the subset the catalog uses. */
function accepts(d: Def, v: unknown): boolean {
  if (d.anyOf) return d.anyOf.some((b) => accepts(b, v));
  if (d.const !== undefined) return v === d.const;
  if (d.enum) return d.enum.includes(v);
  if (isStateRef(d)) return typeof v === "object" && v !== null && "state" in v;
  if (isRefList(d)) return Array.isArray(v) && v.length <= (d.maxItems ?? Infinity);
  switch (d.type) {
    case "string":
      return (
        typeof v === "string" &&
        v.length >= (d.minLength ?? 0) &&
        v.length <= (d.maxLength ?? Infinity) &&
        (d.pattern === undefined || new RegExp(d.pattern).test(v))
      );
    case "number":
    case "integer":
      return (
        typeof v === "number" &&
        (d.type === "number" || Number.isInteger(v)) &&
        v >= (d.minimum ?? -Infinity) &&
        v <= (d.maximum ?? Infinity)
      );
    case "boolean":
      return typeof v === "boolean";
    default:
      throw new Error(`catalog cases: unsupported schema ${JSON.stringify(d)}`);
  }
}

function validSamples(d: Def): Sample[] {
  if (d.anyOf) return d.anyOf.flatMap(validSamples);
  if (d.const !== undefined) return [num(d.const as number)];
  if (d.enum) return (d.enum as string[]).map(text);
  if (isStateRef(d)) return [STATE];
  if (isRefList(d)) return [EMPTY_LIST];
  if (d.type === "string") {
    if (d.pattern) {
      const sample = PATTERNS[d.pattern];
      if (!sample) throw new Error(`catalog cases: no sample for pattern ${d.pattern}`);
      return [text(sample.valid)];
    }
    return [text("Hello")];
  }
  if (d.type === "number" || d.type === "integer") {
    const out = [d.minimum ?? 3];
    if (d.maximum !== undefined) out.push(d.maximum);
    if (d.type === "number") out.push((d.minimum ?? 0) + 0.5);
    return out.map(num);
  }
  throw new Error(`catalog cases: no valid sample for ${JSON.stringify(d)}`);
}

/** Candidates for a rejected value; only those the definition doesn't accept are used. */
function invalidCandidates(d: Def): Sample[] {
  const out: Sample[] = [
    { src: ["true"], value: true },
    { src: ["null"], value: null },
    text("nope"),
    num(4),
    num(1.5),
    STATE,
    EMPTY_LIST,
    { src: ["other"], value: { ref: "other" } },
  ];
  const walk = (b: Def) => {
    if (b.anyOf) return b.anyOf.forEach(walk);
    if (b.maxLength !== undefined) out.push({ src: ['"', { repeat: "x", times: b.maxLength + 1 }, '"'], value: "x".repeat(b.maxLength + 1) });
    if (b.minLength) out.push(text(""));
    if (b.pattern && PATTERNS[b.pattern]) out.push(text(PATTERNS[b.pattern]!.invalid));
    if (b.minimum !== undefined) out.push(num(b.minimum - 1));
    if (b.maximum !== undefined) out.push(num(b.maximum + 1));
    if (b.maxItems !== undefined) {
      const ids = Array.from({ length: b.maxItems + 1 }, (_, i) => `c${i}`);
      out.push({ src: [`[${ids.join(", ")}]`], value: ids });
    }
  };
  walk(d);
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = JSON.stringify(s.src);
    if (seen.has(key)) return false;
    seen.add(key);
    return !accepts(d, s.value);
  });
}

function catalogCase(type: string, shape: ComponentShape): ConformanceCase {
  const props = shape.props.properties ?? {};
  const required = new Set(shape.props.required ?? []);
  const base = new Map<string, Sample>();
  for (const name of Object.keys(props)) if (required.has(name)) base.set(name, validSamples(props[name]!)[0]!);

  const call = (values: Map<string, Sample>, extraPositional = false): InputPart[] => {
    const args: InputPart[][] = [];
    for (const name of shape.positional) {
      if (!values.has(name)) break;
      args.push(values.get(name)!.src);
    }
    const positionalUsed = new Set(shape.positional.slice(0, args.length));
    for (const [name, sample] of values) if (!positionalUsed.has(name)) args.push([`${name}=`, ...sample.src]);
    if (extraPositional) args.splice(positionalUsed.size, 0, ['"extra"']);
    return [`${type}(`, ...args.flatMap((a, i) => (i ? [", ", ...a] : a)), ")"];
  };

  const accepted: { values: Map<string, Sample>; governed: boolean }[] = [];
  const rejected: InputPart[][] = [];
  const seen = new Set<string>();
  for (const [name, def] of Object.entries(props)) {
    for (const sample of validSamples(def)) {
      const values = new Map(base).set(name, sample);
      const key = JSON.stringify(call(values));
      if (seen.has(key)) continue;
      seen.add(key);
      accepted.push({ values, governed: type === "Button" && name === "action" });
    }
    for (const sample of invalidCandidates(def)) rejected.push(call(new Map(base).set(name, sample)));
    if (required.has(name)) {
      const without = new Map(base);
      without.delete(name);
      rejected.push(call(without));
    }
  }
  if (!accepted.length) accepted.push({ values: new Map(base), governed: false });
  rejected.push(call(new Map(base).set("style", text("color: red"))));
  rejected.push(call(base, true));

  const parent = type === "ListItem" ? "List" : "Stack";
  const ids = accepted.map((_, i) => `a${i + 1}`);
  const lines: InputPart[][] = [[`root = ${parent}([${ids.join(", ")}])`], [`${STATE_KEY} = ""`]];
  const nodes: Record<string, { type: string; props: Record<string, unknown>; children: string[] }> = {
    root: { type: parent, props: {}, children: ids },
  };
  accepted.forEach(({ values, governed }, i) => {
    lines.push([`${ids[i]} = `, ...call(values)]);
    if (governed) lines.push([`g${i + 1} = McpMutation(${ids[i]}, tool="payments.confirm")`]);
    const nodeProps: Record<string, unknown> = {};
    let children: string[] = [];
    for (const [name, sample] of values) {
      if (isRefList(props[name]!)) children = sample.value as string[];
      else nodeProps[name] = sample.value;
    }
    nodes[ids[i]!] = { type, props: nodeProps, children };
  });
  const issues = rejected.map((parts, i) => {
    lines.push([`r${i + 1} = `, ...parts]);
    return { line: lines.length, code: "invalid_props" };
  });

  return {
    id: `catalog-${type}`,
    rules: ["5.8", "5.9"],
    description: `Every prop of ${type}: ${accepted.length} accepted lines and ${rejected.length} rejected ones. Generated from schema.json.`,
    input: mergeParts(lines.flatMap((l) => [...l, "\n"])),
    assets: ASSETS,
    expect: { issues, nodes, state: { [STATE_KEY]: "" } },
  };
}

/** Join neighbouring plain-text parts, so a case's input is a string unless it needs a repeat. */
function mergeParts(parts: InputPart[]): string | InputPart[] {
  const out: InputPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (typeof part === "string" && typeof last === "string") out[out.length - 1] = last + part;
    else out.push(part);
  }
  return out.length === 1 && typeof out[0] === "string" ? out[0] : out;
}

export function catalogCases(schemaPath = "conformance/schema.json"): ConformanceCase[] {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as { components: Record<string, ComponentShape> };
  return Object.entries(schema.components).map(([type, shape]) => catalogCase(type, shape));
}
