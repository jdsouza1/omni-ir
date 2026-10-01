import { z } from "zod";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser, type ParserEvent } from "../engine/parser";
import { COMPONENTS, COMPONENT_TYPES } from "../engine/schema";
import { buildSystemPrompt, examplesIn } from "../server/prompt";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("is byte-identical across builds and dates, so it can be cached", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const a = buildSystemPrompt();
    vi.setSystemTime(new Date("2027-06-15T12:34:56Z"));
    const b = buildSystemPrompt();
    vi.useRealTimers();
    expect(a).toBe(b);
    expect(a).toBe(prompt);
  });

  it("describes every component, prop and enum value in the schema", () => {
    for (const type of COMPONENT_TYPES) {
      expect(prompt, type).toContain(`${type}(`);
      const schema = z.toJSONSchema(COMPONENTS[type].props) as { properties: Record<string, { enum?: string[] }> };
      for (const [prop, def] of Object.entries(schema.properties)) {
        expect(prompt, `${type}.${prop}`).toContain(prop);
        for (const value of def.enum ?? []) expect(prompt, `${type}.${prop}=${value}`).toContain(`"${value}"`);
      }
    }
    expect(prompt).toContain("McpMutation(");
  });

  it("lists every permitted tool and its params", () => {
    for (const [tool, schema] of Object.entries(TOOLS)) {
      expect(prompt).toContain(tool);
      const json = z.toJSONSchema(schema) as { properties: Record<string, unknown> };
      for (const param of Object.keys(json.properties)) expect(prompt, `${tool}.${param}`).toContain(param);
    }
  });

  it("lists every registered image by name, and no URLs", () => {
    for (const name of Object.keys(ASSETS)) expect(prompt).toContain(`- ${name}\n`);
    expect(prompt).not.toMatch(/https?:\/\/|data:image/);
  });

  it("states the rules the parser enforces", () => {
    expect(prompt).toMatch(/no prose/i);
    expect(prompt).toMatch(/code fences/i);
    expect(prompt).toContain("root");
    expect(prompt).toContain("McpMutation");
    expect(prompt).toContain("\\\\"); // tells the model to write \\ for a backslash
  });

  it("includes at least two examples, and every example parses with no errors, warnings or issues", () => {
    const examples = examplesIn(prompt);
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const example of examples) {
      const parser = createParser({ tools: TOOLS });
      const events: ParserEvent[] = [];
      parser.subscribe((e) => events.push(e));
      parser.write(example);
      expect(parser.end()).toEqual([]);
      expect(events.filter((e) => e.type === "error" || e.type === "warning")).toEqual([]);
    }
  });

  it("stays a reasonable size", () => {
    expect(prompt.length).toBeLessThan(20_000);
  });

  it("matches the snapshot (review changes to the prompt in diffs)", () => {
    expect(prompt).toMatchSnapshot();
  });
});
