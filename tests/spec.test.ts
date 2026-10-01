import { existsSync, readFileSync } from "node:fs";
import { TOOLS } from "../app/tools";
import { createParser } from "@omni-ir/core";
import { COMPONENT_TYPES } from "@omni-ir/core";
import { ISSUE_CODES } from "@omni-ir/core";
import { applySections, renderSections } from "../scripts/spec";

const spec = readFileSync("SPEC.md", "utf8");

describe("SPEC.md", () => {
  it("is up to date with the schema (run npm run spec if this fails)", () => {
    expect(applySections(spec, renderSections())).toBe(spec);
  });

  it("describes every component and every issue code", () => {
    for (const type of COMPONENT_TYPES) expect(spec).toContain(`### ${type}\n`);
    for (const [code, info] of Object.entries(ISSUE_CODES)) {
      expect(spec).toContain(`\`${code}\``);
      expect(info.meaning.length).toBeGreaterThan(10);
    }
  });

  it("only points at test files that exist", () => {
    const referenced = [...spec.matchAll(/`(tests\/[\w.]+)`/g)].map((m) => m[1]!);
    expect(referenced.length).toBeGreaterThan(3);
    for (const path of referenced) expect(existsSync(path), path).toBe(true);
  });

  it("has an overview example that parses with no issues", () => {
    const example = /## 1\. Overview[\s\S]*?```\n([\s\S]*?)```/.exec(spec)![1]!;
    const parser = createParser({ tools: TOOLS });
    const issues: string[] = [];
    parser.subscribe((e) => (e.type === "error" || e.type === "warning") && issues.push(e.issue.code));
    parser.write(example);
    parser.end();
    expect(issues).toEqual([]);
    expect(parser.getSnapshot().nodes.size).toBeGreaterThan(3);
  });

  it("only changes text between generated markers", () => {
    const doc = "intro\n<!-- generated:limits -->\nold\n<!-- /generated:limits -->\noutro\n";
    const out = applySections(doc, { limits: "new" });
    expect(out).toBe("intro\n<!-- generated:limits -->\nnew\n<!-- /generated:limits -->\noutro\n");
    expect(() => applySections(doc, { limits: "x", examples: "y" })).toThrow(/missing the markers/);
  });
});
