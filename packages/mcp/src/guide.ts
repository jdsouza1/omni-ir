// The format guide in show_screen's description (PLAN-MCPAPPS.md, decision 2): a compact version of
// the reference server's system prompt, generated from the schema and the app's tools and pictures,
// so it can never describe something the parser rejects. Hosts send it with every request in a
// conversation, so it is kept under 1,500 tokens (a test measures it).
import { z } from "zod";
import { COMPONENT_TYPES, describeComponent, describeValue, type JsonSchema, type ToolRegistry } from "@omni-ir/core";

/** A picture the app provides: the same shape as an asset registry entry. */
export interface Picture {
  src: string;
  width: number;
  height: number;
}

/** A small, valid screen that uses no tools, so it fits any app. */
export const GUIDE_EXAMPLE = `root = Card([title, when, guests, actions])
title = Heading("Book a table")
$date = ""
when = DateInput($date, label="Date")
$size = "2"
guests = Select($size, label="Guests", options=["2", "4", "6"])
actions = Stack([cancel], direction="row")
cancel = Button("Cancel", variant="secondary")`;

export function buildGuide({ tools, assets }: { tools: ToolRegistry; assets: Readonly<Record<string, Picture>> }): string {
  const components = COMPONENT_TYPES.map((type) => {
    const shape = describeComponent(type);
    const props = shape.props.filter((p) => p.summary !== "[id, …]").map((p) => `${p.name}: ${p.summary}`);
    return props.length > 0 ? `${shape.signature}: ${props.join("; ")}` : shape.signature;
  });
  const toolLines = Object.entries(tools).map(([name, schema]) => {
    const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as JsonSchema;
    const params = Object.entries(json.properties ?? {}).map(([param, def]) => `${param}: ${describeValue(def)}`);
    return `- ${name} {${params.join("; ")}}`;
  });
  const pictures = Object.keys(assets);

  return `Shows a screen to the person, drawn by the app's own components. Write it in Omni-IR: one statement per line, no prose, Markdown, HTML or code.
- \`id = Component(args)\` defines a component; \`$name = value\` declares state; \`# …\` is a comment. Write \`root = …\` first.
- Arguments: positional, then named (\`level=2\`); [brackets] mark optional ones. Values: "text" (escape \\" and \\\\), numbers, true, false, null, ids, $state, [id, …] children, ["a", 2] value lists.
- One call per line, never nested: \`root = Card([title])\` then \`title = Heading("Hi")\`. Ids are unique; each component has one parent.
- Inputs, DateInputs ("YYYY-MM-DD" or ""), Selects and Switches edit $state; declare it first. A List holds ListItems, a Table TableRows (one cell per column), Tabs hold Tab, a Bar or LineChart holds Series (one number per label), a PieChart holds Slices.
- No styling, URLs or expressions: choose among the listed values.${
    toolLines.length > 0
      ? `
- A Button with \`action\` needs exactly one McpMutation naming it and a tool below, never listed as a child: \`pay = Button("Pay", action="go")\` and \`go = McpMutation(pay, tool="…", params={amount: $amount})\`. Send typed values through params. Use a tool only for what its name says; if none fits, use a Button without action.`
      : `
- This app has no actions: Buttons have no \`action\`, and there is no McpMutation.`
  }
- Use only what is listed; if something is missing, build the closest screen. The result lists rejected lines: call again with them fixed.

Components:
${components.join("\n")}
${toolLines.length > 0 ? `McpMutation(target, tool=…, [params={name: value or $state}])\n\nTools:\n${toolLines.join("\n")}` : ""}

Pictures (by name, for Image and ListItem image): ${pictures.length > 0 ? pictures.join(", ") : "no pictures: don't use Image"}

Example:
${GUIDE_EXAMPLE}`;
}
