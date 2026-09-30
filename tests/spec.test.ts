import { readFileSync } from "node:fs";
import { COMPONENT_TYPES } from "../engine/schema";
import { ISSUE_CODES } from "../engine/types";
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

  it("only changes text between generated markers", () => {
    const doc = "intro\n<!-- generated:limits -->\nold\n<!-- /generated:limits -->\noutro\n";
    const out = applySections(doc, { limits: "new" });
    expect(out).toBe("intro\n<!-- generated:limits -->\nnew\n<!-- /generated:limits -->\noutro\n");
    expect(() => applySections(doc, { limits: "x", examples: "y" })).toThrow(/missing the markers/);
  });
});
