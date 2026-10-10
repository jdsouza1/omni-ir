// Step 18 (PLAN-MCPAPPS.md): the parts of the MCP Apps bridge that need no host. How the view writes a
// tool argument that streams in [10.26], how it maps a host's theme onto the design tokens (A.3), and
// the compact format guide in the tool's description (B.1). No network, no paid API.
import { describe, expect, it } from "vitest";
import { encoding_for_model } from "tiktoken";
import { COMPONENT_TYPES, createParser } from "@omni-ir/core";
import { CONTRAST_PAIRS, LIGHT, DARK, contrast, cssVariable } from "@omni-ir/react";
import { buildGuide, GUIDE_EXAMPLE } from "@omni-ir/mcp";
import { createInputWriter } from "../packages/mcp/src/view/stream";
import { hostTheme } from "../packages/mcp/src/view/theme";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";

/** A sink that records what was written to each parser the writer opened. */
function recorder() {
  const parsers: { written: string; ended: boolean }[] = [];
  const writer = createInputWriter(() => {
    const p = { written: "", ended: false };
    parsers.push(p);
    return { write: (t: string) => void (p.written += t), end: () => void (p.ended = true) };
  });
  return { writer, parsers };
}

describe("writing a streamed tool argument to the parser [10.26]", () => {
  it("writes only complete lines from partial input, each once, in order", () => {
    const { writer, parsers } = recorder();
    writer.partial("root = Card([a, b])\na = Hea");
    writer.partial("root = Card([a, b])\na = Heading(\"Hi\")\nb = Te");
    expect(parsers).toHaveLength(1);
    expect(parsers[0]).toEqual({ written: 'root = Card([a, b])\na = Heading("Hi")\n', ended: false });
  });

  it("writes the rest and ends the parser when the complete argument arrives", () => {
    const { writer, parsers } = recorder();
    writer.partial("root = Card([a])\na = Te");
    writer.complete('root = Card([a])\na = Text("Done")');
    expect(parsers).toEqual([{ written: 'root = Card([a])\na = Text("Done")', ended: true }]);
  });

  it("starts a new parser when the text doesn't extend what was written (the host's guess changed)", () => {
    const { writer, parsers } = recorder();
    writer.partial('root = Card([a])\na = Text("one")\n');
    writer.partial('root = Card([a])\na = Text("two")\n');
    expect(parsers).toHaveLength(2);
    expect(parsers[0]!.ended).toBe(false);
    expect(parsers[1]!.written).toBe('root = Card([a])\na = Text("two")\n');
    writer.complete('root = Stack([x])\nx = Divider()\n');
    expect(parsers).toHaveLength(3);
    expect(parsers[2]).toEqual({ written: "root = Stack([x])\nx = Divider()\n", ended: true });
  });

  it("works with no partial input at all, and ignores input after the end", () => {
    const { writer, parsers } = recorder();
    writer.complete("root = Divider()\n");
    writer.partial("root = Divider()\nmore");
    writer.complete("other");
    expect(parsers).toEqual([{ written: "root = Divider()\n", ended: true }]);
  });

  it("treats \\r\\n like \\n when deciding which lines are complete", () => {
    const { writer, parsers } = recorder();
    writer.partial("root = Divider()\r\nx = Te");
    expect(parsers[0]!.written).toBe("root = Divider()\r\n");
  });
});

describe("the host's theme on the design tokens (A.3)", () => {
  it("maps the host's standard variables onto the catalog's tokens, and its light or dark theme", () => {
    const { theme, variables } = hostTheme({
      theme: "dark",
      styles: { variables: { "--color-background-primary": "#1f1f1e", "--color-text-primary": "#f5f4ef", "--font-sans": '"Inter", sans-serif', "--border-radius-md": "10px" } },
    });
    expect(theme).toBe("dark");
    expect(variables[cssVariable("surface")]).toBe("#1f1f1e");
    expect(variables[cssVariable("text")]).toBe("#f5f4ef");
    expect(variables[cssVariable("font")]).toBe('"Inter", sans-serif');
    expect(variables[cssVariable("radius")]).toBe("10px");
  });

  it("picks the right side of light-dark() for the theme", () => {
    const vars = { "--color-background-primary": "light-dark(#ffffff, #101010)", "--color-text-primary": "light-dark(#111111, #eeeeee)" };
    expect(hostTheme({ theme: "light", styles: { variables: vars } }).variables[cssVariable("surface")]).toBe("#ffffff");
    expect(hostTheme({ theme: "dark", styles: { variables: vars } }).variables[cssVariable("surface")]).toBe("#101010");
  });

  it("keeps the catalog's own colour where the host's would break a contrast pair, or can't be checked", () => {
    const low = hostTheme({ theme: "light", styles: { variables: { "--color-background-primary": "#ffffff", "--color-text-primary": "#dddddd", "--color-text-secondary": "rgb(10 10 10)" } } });
    expect(low.variables[cssVariable("text")]).toBeUndefined();
    expect(low.variables[cssVariable("mutedText")]).toBeUndefined();
    expect(low.kept).toEqual(expect.arrayContaining(["text", "mutedText"]));
  });

  it("every pair still meets its contrast with whatever subset a host sends", () => {
    const hosts = [
      { "--color-background-primary": "#ffffff" },
      { "--color-background-primary": "#1b1b1b", "--color-text-primary": "#fafafa", "--color-text-secondary": "#bdbdbd" },
      { "--color-background-primary": "#f4f1ea", "--color-border-primary": "#9a958a", "--color-text-danger": "#b42318", "--color-background-danger": "#fde8e6" },
    ];
    for (const [i, variables] of hosts.entries()) {
      const theme = i === 1 ? "dark" : "light";
      const mapped = hostTheme({ theme, styles: { variables } }).variables;
      const base = theme === "dark" ? DARK : LIGHT;
      const colour = (token: keyof typeof LIGHT) => mapped[cssVariable(token)] ?? base[token];
      for (const [fore, back, minimum] of CONTRAST_PAIRS) {
        expect(contrast(colour(fore), colour(back)), `${fore} on ${back}, host ${i}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it("with no host context: the light theme and no overrides", () => {
    expect(hostTheme(undefined)).toEqual({ theme: "light", variables: {}, kept: [] });
  });
});

describe("the format guide in the tool's description (B.1)", () => {
  const guide = buildGuide({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
  const encoder = encoding_for_model("gpt-5" as Parameters<typeof encoding_for_model>[0]);
  const count = (text: string) => encoder.encode(text).length;

  // Decision 2 of Step 18, split by decision 8 of Step 20: the fixed part (grammar, catalog, example)
  // has its own budget, and each of the app's tools and components adds at most a set amount.
  it("keeps the fixed part within 1,350 tokens, each tool within 40 and each app component within 120", () => {
    const base = buildGuide({ tools: {}, assets: {} });
    expect(count(base)).toBeLessThanOrEqual(1350);
    const withTool = buildGuide({ tools: { "payments.confirm": TOOLS["payments.confirm"]! }, assets: {} });
    for (const [name, schema] of Object.entries(TOOLS)) {
      const more = buildGuide({ tools: { "payments.confirm": TOOLS["payments.confirm"]!, [name]: schema }, assets: {} });
      expect(count(more) - count(withTool), name).toBeLessThanOrEqual(40);
    }
    for (const component of Object.values(APP_COMPONENTS)) {
      const one = buildGuide({ tools: {}, assets: {}, components: { [component.name]: component } });
      const two = buildGuide({ tools: {}, assets: {}, components: { ...APP_COMPONENTS } });
      expect(count(one) - count(base), component.name).toBeLessThanOrEqual(120 + 30); // + the section's heading
      expect(count(two) - count(one)).toBeLessThanOrEqual(120);
    }
    // The demo app's whole guide, for the record: within the sum of its parts.
    expect(count(guide)).toBeLessThanOrEqual(1350 + 40 * Object.keys(TOOLS).length + 120 * Object.keys(APP_COMPONENTS).length + 30 + 60);
  });

  it("names the app's own components and picture patterns", () => {
    for (const name of Object.keys(APP_COMPONENTS)) expect(guide).toContain(`${name}(`);
    expect(guide).toContain("product-{id}");
  });

  it("names every component, every tool with its params, and every picture", () => {
    for (const type of COMPONENT_TYPES) expect(guide).toContain(`${type}(`);
    for (const tool of Object.keys(TOOLS)) expect(guide).toContain(tool);
    for (const name of Object.keys(ASSETS)) expect(guide).toContain(name);
    expect(guide).toContain("McpMutation(");
  });

  it("its example is valid Omni-IR for these tools", () => {
    expect(guide).toContain(GUIDE_EXAMPLE);
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    const errors: string[] = [];
    parser.subscribe((e) => e.type === "error" && errors.push(e.issue.code));
    parser.write(GUIDE_EXAMPLE);
    parser.end();
    expect(errors).toEqual([]);
  });

  it("says when there are no pictures or tools", () => {
    const bare = buildGuide({ tools: {}, assets: {} });
    expect(bare).toMatch(/no pictures/i);
    expect(bare).toMatch(/no actions/i);
  });
});
