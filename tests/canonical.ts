// The canonical, language-neutral view of a parse (see conformance/README.md), shared by the
// conformance suite, the fuzz tests and the differential corpus (fuzz/).
import { z } from "zod";
import { createParser, defineComponents, type AppComponentDeclaration, type OmniDocument, type PicturePattern } from "@omni-ir/core";

export interface CanonicalIssue {
  line: number | null;
  code: string;
}

export function canonical(doc: OmniDocument, issues: CanonicalIssue[]) {
  const value = (v: unknown): unknown =>
    v !== null && typeof v === "object" && (v as { kind?: string }).kind === "state" ? { state: (v as { key: string }).key } : v;
  const props = (p: object) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, value(v)]));
  const distinct = [...new Map(issues.map((i) => [`${i.line}:${i.code}`, i])).values()];
  return {
    issues: distinct.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity) || a.code.localeCompare(b.code)),
    // An app component (Step 20) is written by its own name, marked app: true.
    nodes: Object.fromEntries(
      [...doc.nodes].map(([id, n]) => [id, n.type === "App" ? { type: n.name, app: true, props: props(n.props), children: [...n.children] } : { type: n.type, props: props(n.props), children: [...n.children] }]),
    ),
    state: { ...doc.state },
    mutations: Object.fromEntries(
      [...doc.mutations].map(([target, m]) => [target, { id: m.id, tool: m.tool, params: props(m.params) }]),
    ),
    missing: [...doc.missing].sort(),
  };
}

export type Canonical = ReturnType<typeof canonical>;

export interface ParseOptions {
  /** Tool names in the registry (param schemas don't matter to the parser, [5.14]). */
  tools?: readonly string[];
  /** Picture names in the registry. */
  assets?: readonly string[];
  /** The app's own components, as their plain-JSON declarations (Step 20). */
  components?: Readonly<Record<string, AppComponentDeclaration>>;
  /** Families of picture names, as plain JSON (Step 20). */
  pictures?: readonly PicturePattern[];
}

/**
 * Parse a stream fed as the given chunks (strings, or bytes for byte-level splits) and return the
 * canonical result. Any exception escapes, so a test sees it.
 */
export function parseCanonical(chunks: readonly (string | Uint8Array)[], { tools = ["payments.confirm"], assets = [], components = {}, pictures = [] }: ParseOptions = {}): Canonical {
  return parseWithUpdates(chunks, [], { tools, assets, components, pictures }).screen;
}

/** The canonical result of an update: whether it applied, and its distinct issues (SPEC.md [10.33]). */
export interface CanonicalUpdate {
  applied: boolean;
  issues: CanonicalIssue[];
}

/**
 * Parse a stream, end it, then apply each update in order ([10.29]). `screen` is the canonical result
 * after the last update, with the stream's issues; `updates` each update's own result.
 */
export function parseWithUpdates(
  chunks: readonly (string | Uint8Array)[],
  updates: readonly string[],
  { tools = ["payments.confirm"], assets = [], components = {}, pictures = [] }: ParseOptions = {},
): { screen: Canonical; updates: CanonicalUpdate[] } {
  const parser = createParser({
    tools: Object.fromEntries(tools.map((name) => [name, z.any()])),
    assets: Object.fromEntries(assets.map((name) => [name, {}])),
    components: defineComponents(components),
    pictures,
  });
  const issues: CanonicalIssue[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") issues.push({ line: e.issue.line ?? null, code: e.issue.code });
  });
  for (const chunk of chunks) parser.write(chunk);
  parser.end();
  const results = updates.map((text): CanonicalUpdate => {
    const result = parser.update(text);
    return { applied: result.applied, issues: canonical(parser.getSnapshot(), result.issues.map((x) => ({ line: x.line ?? null, code: x.code }))).issues };
  });
  return { screen: canonical(parser.getSnapshot(), issues), updates: results };
}
