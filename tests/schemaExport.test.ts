// conformance/schema.json is the language-neutral export of the schema that other renderers
// (Swift, Kotlin) generate their catalog from, so it must never fall behind schema.ts.
import { readFileSync } from "node:fs";
import { COMPONENT_TYPES, COMPONENTS, CROSS_PROP_RULES, ISSUE_CODES } from "@omni-ir/core";
import { renderSchemaJson, SCHEMA_JSON_PATH } from "../scripts/schema-export";

describe("conformance/schema.json", () => {
  const schema = JSON.parse(readFileSync(SCHEMA_JSON_PATH, "utf8"));

  it("is up to date with the schema (run npm run schema:export if this fails)", () => {
    expect(readFileSync(SCHEMA_JSON_PATH, "utf8")).toBe(renderSchemaJson());
  });

  it("describes every component, its positional arguments and props, and every issue code", () => {
    expect(Object.keys(schema.components)).toEqual(COMPONENT_TYPES);
    for (const type of COMPONENT_TYPES) {
      expect(schema.components[type].positional, type).toEqual([...COMPONENTS[type].positional]);
      expect(Object.keys(schema.components[type].props.properties), type).toEqual(Object.keys(COMPONENTS[type].props.shape));
    }
    expect(Object.keys(schema.issueCodes)).toEqual(Object.keys(ISSUE_CODES));
  });

  it("lists each rule across props for a component that exists", () => {
    for (const rule of CROSS_PROP_RULES) expect(COMPONENT_TYPES).toContain(rule.component);
  });
});
