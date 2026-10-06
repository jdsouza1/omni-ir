// The canonical, language-neutral view of a parse (see conformance/README.md), shared by the
// conformance suite, the fuzz tests and the differential corpus (fuzz/).
import { z } from "zod";
import { createParser, type OmniDocument } from "@omni-ir/core";

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
    nodes: Object.fromEntries([...doc.nodes].map(([id, n]) => [id, { type: n.type, props: props(n.props), children: [...n.children] }])),
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
}

/**
 * Parse a stream fed as the given chunks (strings, or bytes for byte-level splits) and return the
 * canonical result. Any exception escapes, so a test sees it.
 */
export function parseCanonical(chunks: readonly (string | Uint8Array)[], { tools = ["payments.confirm"], assets = [] }: ParseOptions = {}): Canonical {
  const parser = createParser({
    tools: Object.fromEntries(tools.map((name) => [name, z.any()])),
    assets: Object.fromEntries(assets.map((name) => [name, {}])),
  });
  const issues: CanonicalIssue[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") issues.push({ line: e.issue.line ?? null, code: e.issue.code });
  });
  for (const chunk of chunks) parser.write(chunk);
  parser.end();
  return canonical(parser.getSnapshot(), issues);
}
