import { z } from "zod";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser, type ParserEvent } from "@omni-ir/core";
import { COMPONENTS, COMPONENT_TYPES, describeComponent } from "@omni-ir/core";
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

  // From the model check of 2026-10-01 (docs/model-check-2026-10-01.md).
  it("keeps the rules added after the first model check", () => {
    expect(prompt).toContain("Use a tool only for what its name says");
    expect(prompt).toContain("A Rating shows its own number");
    expect(prompt).toContain("A Skeleton is only a placeholder");
  });

  // Step 13 model check: Gemini and Llama wrote Image("cabin-pines", "Lakeside cabin") from
  // `Image(asset, alt, ratio?)`; GPT listed the McpMutation in the layout after "wrap it in".
  it("shows which props must be named, in every component signature", () => {
    for (const type of COMPONENT_TYPES) {
      const shape = describeComponent(type);
      const args = shape.signature.slice(type.length + 1, -1).split(", ").filter(Boolean);
      expect(args, type).toHaveLength(shape.props.length);
      const ordered = [...shape.props].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
      ordered.forEach((p, i) => {
        const bare = p.position === null ? `${p.name}=…` : p.name;
        expect(args[i], `${type}.${p.name}`).toBe(p.required ? bare : `[${bare}]`);
      });
      expect(prompt).toContain(shape.signature);
    }
    expect(prompt).toContain("Image(asset, alt=…, [ratio=…])");
    expect(prompt).toContain("must be given by name");
  });

  it("says the Button, not its McpMutation, goes in the layout, and that there are no expressions", () => {
    expect(prompt).toContain("The McpMutation is never listed as a child");
    expect(prompt).not.toContain("Wrap it in");
    expect(prompt).toContain("no expressions");
  });

  it("explains the Step 10 components: Select and Switch state, one line per table row, Tabs and Notice tones", () => {
    expect(prompt).toContain("A Select picks one option and edits a text state");
    expect(prompt).toContain("A Switch turns a setting on or off and edits a true/false state");
    expect(prompt).toContain("A Select's state starts as");
    expect(prompt).toContain("A Table holds only TableRows, one line per row, each with one cell per column");
    expect(prompt).toContain("Tabs hold only Tab components");
    expect(prompt).toContain("A Notice shows a short message in a box");
    expect(prompt).toContain("a BarChart compares values across categories");
    expect(prompt).toContain("Charts carry a title, labels and numbers only");
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
