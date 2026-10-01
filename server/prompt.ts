// The system prompt for a real model, generated from the schema, the tool registry and fixtures,
// so it can never describe a component, prop, enum value or tool the parser doesn't accept.
// It must stay deterministic (no dates, ids or random order) so it can be prompt-cached.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ASSETS, type AssetRegistry } from "../app/assets";
import { TOOLS } from "../app/tools";
import { describeComponent, describeValue, type JsonSchema } from "@omni-ir/core";
import { COMPONENT_TYPES, type ToolRegistry } from "@omni-ir/core";

export interface PromptOptions {
  tools?: ToolRegistry;
  /** Images the model may name; defaults to the shared registry. */
  assets?: AssetRegistry;
  fixturesDir?: string;
  /** Fixture names used as examples, in order. */
  examples?: string[];
}

const DEFAULT_EXAMPLES = ["payment-confirmation", "sign-in", "order-status"];

export function buildSystemPrompt(options: PromptOptions = {}): string {
  const tools = options.tools ?? TOOLS;
  const assets = options.assets ?? ASSETS;
  const dir = options.fixturesDir ?? resolve("fixtures");
  const examples = (options.examples ?? DEFAULT_EXAMPLES).map((name) =>
    readFileSync(join(dir, `${name}.omni`), "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
      .trim(),
  );

  return `You write user interfaces in Omni-IR, a line-oriented UI language. A trusted client parses each line as it streams in and renders it with its own components and styling.

## Output
Reply with Omni-IR lines only: no prose, no Markdown, no code fences. Each line is one statement:
- \`id = Component(args)\` defines a component.
- \`$name = value\` declares a piece of state.
- \`# comment\` lines are allowed.
Write \`root = …\` first and its parts after it; referring to an id before its line arrives is fine, and the client shows a placeholder until it does.

## Grammar
- Arguments: positional first, then named: \`Button("Pay now", action="pay", variant="primary")\`.
- Values: "double-quoted text", numbers, true, false, null, component ids, $state, and [id, id] lists of children.
- One component call per line. Never nest a call inside another: write \`root = Card([title])\` and \`title = Heading("Hi")\`, not \`root = Card([Heading("Hi")])\`.
- Ids are unique. Every component except root has exactly one parent.
- In text, escape a double quote as \\" and write \\\\ for every backslash (a path is "C:\\\\data"); \\n is a line break.
- Object literals {key: value} appear only in McpMutation params.

## Rules
- A Button with an \`action\` triggers a backend action. Wrap it in exactly one McpMutation that names a tool from the list below:
  \`pay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})\`
  A Button without \`action\` stays in the page (for example Cancel).
- An Input edits a text state: declare \`$note = ""\` and write \`note = Input($note, label="Note")\`. Send typed values to the backend through McpMutation params.
- There is no styling, HTML or CSS. Choose among the listed values.
- An Image or a ListItem's image shows a picture the app provides: name one from the Images list below. There are no URLs.
- A List holds only ListItems, and a ListItem goes only in a List.
- A DateInput edits a date state written \`"YYYY-MM-DD"\`, or \`""\` for none: declare \`$checkIn = ""\` and write \`checkIn = DateInput($checkIn, label="Check-in")\`. A date range is two DateInputs.
- Use only the components, tools and images listed here. If a request needs something that isn't available, build the closest screen you can with what is.

## Components
${COMPONENT_TYPES.map(componentBlock).join("\n\n")}

McpMutation(target, tool, params?)
  target: id of the Button it governs
  tool: one of the tools below
  params: {name: value or $state, …}

## Tools
${Object.entries(tools)
  .map(([name, schema]) => describeTool(name, schema))
  .join("\n")}

## Images
${Object.keys(assets).length ? Object.keys(assets).map((name) => `- ${name}`).join("\n") : "(none: don't use Image)"}

## Examples
${examples.map((example) => `<example>\n${example}\n</example>`).join("\n\n")}
`;
}

/** The Omni-IR text inside each <example> block of a prompt. */
export function examplesIn(prompt: string): string[] {
  return [...prompt.matchAll(/<example>\n([\s\S]*?)\n<\/example>/g)].map((m) => m[1]!);
}

// ---------------------------------------------------------------------------

function componentBlock(type: (typeof COMPONENT_TYPES)[number]): string {
  const shape = describeComponent(type);
  return [shape.signature, ...shape.props.map((p) => `  ${p.name}: ${p.summary}`)].join("\n");
}

function describeTool(name: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema) as JsonSchema;
  const params = Object.entries(json.properties ?? {}).map(([param, def]) => `${param}: ${describeValue(def, true)}`);
  return `- ${name}: params {${params.join("; ")}}`;
}
