// Runs the language-neutral conformance suite (conformance/cases/*.json) against this repo's parser.
import { readFileSync, readdirSync } from "node:fs";
import { z } from "zod";
import { CASES, renderCaseFiles, type ConformanceCase, type InputPart } from "../conformance/build";
import { createParser, defineComponents, type AppComponentDeclarations } from "@omni-ir/core";
import { canonical } from "./canonical";

const files = readdirSync("conformance/cases").filter((f) => f.endsWith(".json"));
const cases: ConformanceCase[] = files.flatMap((f) => (JSON.parse(readFileSync(`conformance/cases/${f}`, "utf8")) as { cases: ConformanceCase[] }).cases);

function expand(input: string | InputPart[]): string {
  return typeof input === "string" ? input : input.map((p) => (typeof p === "string" ? p : p.repeat.repeat(p.times))).join("");
}

function run(c: ConformanceCase, chunkSize: number | null) {
  const tools = Object.fromEntries((c.tools ?? ["payments.confirm"]).map((name) => [name, z.any()]));
  const assets = Object.fromEntries((c.assets ?? []).map((name) => [name, {}]));
  const components = defineComponents((c.components ?? {}) as AppComponentDeclarations);
  const parser = createParser({ tools, assets, components, pictures: c.pictures ?? [] });
  const issues: { line: number | null; code: string }[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") issues.push({ line: e.issue.line ?? null, code: e.issue.code });
  });
  const bytes = new TextEncoder().encode(expand(c.input));
  if (chunkSize === null) parser.write(expand(c.input));
  else for (let at = 0; at < bytes.length; at += chunkSize) parser.write(bytes.subarray(at, at + chunkSize));
  parser.end();
  const updates = (c.updates ?? []).map((u) => {
    const result = parser.update(expand(u.input));
    return { applied: result.applied, issues: canonical(parser.getSnapshot(), result.issues.map((x) => ({ line: x.line ?? null, code: x.code }))).issues };
  });
  return { ...canonical(parser.getSnapshot(), issues), updates };
}

describe("conformance suite", () => {
  it("JSON files match conformance/build.ts (run npm run conformance:build if this fails)", () => {
    const expected = renderCaseFiles();
    expect(files.sort()).toEqual(Object.keys(expected).sort());
    for (const [name, text] of Object.entries(expected)) expect(readFileSync(`conformance/cases/${name}`, "utf8")).toBe(text);
  });

  it("has unique case ids", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(cases.map((c) => [c.id, c] as const))("%s", (_, c) => {
    it("gives the expected result, and the same result for every chunking [3.3]", () => {
      const whole = run(c, null);
      for (const size of [1, 5, 13]) expect(run(c, size), `chunks of ${size} bytes`).toEqual(whole);

      const sortIssues = (list: { line: number | null; code: string }[]) =>
        [...list].sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity) || a.code.localeCompare(b.code));
      expect(whole.issues).toEqual(sortIssues(c.expect.issues));
      if (c.expect.nodes) expect(whole.nodes).toEqual(c.expect.nodes);
      if (c.expect.state) expect(whole.state).toEqual(c.expect.state);
      if (c.expect.mutations) expect(whole.mutations).toEqual(c.expect.mutations);
      if (c.expect.missing) expect(whole.missing).toEqual(c.expect.missing);
      expect(whole.updates).toEqual((c.updates ?? []).map((u) => ({ applied: u.expect.applied, issues: sortIssues(u.expect.issues) })));
    });
  });

  it("covers every rule in SPEC.md sections 3-7 and the update rules, and cites only rules that exist", () => {
    const spec = readFileSync("SPEC.md", "utf8");
    const body =
      spec.slice(spec.indexOf("## 3. The stream"), spec.indexOf("## 8. Renderer requirements")) +
      spec.slice(spec.indexOf("**Updates** (optional"), spec.indexOf("**Action results**"));
    const specRules = new Set([...body.matchAll(/\*\*\[(\d+\.\d+)\]\*\*/g)].map((m) => m[1]!));
    const covered = new Set(Object.values(CASES).flat().flatMap((c) => c.rules));
    expect([...specRules].filter((r) => !covered.has(r)), "rules without a case").toEqual([]);
    expect([...covered].filter((r) => !specRules.has(r)), "cases citing unknown rules").toEqual([]);
    expect(specRules.size).toBeGreaterThan(30);
  });
});
