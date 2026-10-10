// The system prompt for a real model, generated from the schema, the tool registry and fixtures,
// so it can never describe a component, prop, enum value or tool the parser doesn't accept.
// It must stay deterministic (no dates, ids or random order) so it can be prompt-cached.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ASSETS, type AssetRegistry } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { describeAppComponent, describeComponent, describeValue, type AppComponents, type JsonSchema, type PicturePattern } from "@omni-ir/core";
import { COMPONENT_TYPES, type ToolRegistry } from "@omni-ir/core";

export interface PromptOptions {
  tools?: ToolRegistry;
  /** Images the model may name; defaults to the shared registry. */
  assets?: AssetRegistry;
  /** The app's own components (Step 20); defaults to the demo app's. */
  components?: AppComponents;
  /** Families of picture names the app looks up (Step 20); defaults to the demo app's. */
  pictures?: readonly PicturePattern[];
  fixturesDir?: string;
  /** Fixture names used as examples, in order. */
  examples?: string[];
}

const DEFAULT_EXAMPLES = ["payment-confirmation", "sign-in", "order-status"];

export function buildSystemPrompt(options: PromptOptions = {}): string {
  const tools = options.tools ?? TOOLS;
  const assets = options.assets ?? ASSETS;
  const appComponents = Object.values(options.components ?? APP_COMPONENTS);
  const patterns = options.pictures ?? PICTURES;
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
- Arguments: positional first, then named: \`Button("Pay now", action="pay", variant="primary")\`. In the Components list, an argument written \`name=…\` must be given by name (\`alt="A cabin"\`, never just \`"A cabin"\`), and one in [brackets] is optional.
- Values: "double-quoted text", numbers, true, false, null, component ids, $state, [id, id] lists of children, and ["text", 2] lists of values (a Select's options, a Table's columns and a TableRow's cells).
- One component call per line. Never nest a call inside another: write \`root = Card([title])\` and \`title = Heading("Hi")\`, not \`root = Card([Heading("Hi")])\`.
- Ids are unique. Every component except root has exactly one parent.
- In text, escape a double quote as \\" and write \\\\ for every backslash (a path is "C:\\\\data"); \\n is a line break.
- Object literals {key: value} appear only in McpMutation params.
- Values are written out in full: there are no expressions, so no \`+\`, sums or joined text.

## Rules
- A Button with an \`action\` triggers a backend action. List the Button in its parent like any other component, then add exactly one McpMutation line that names the Button and a tool from the list below. The McpMutation is never listed as a child:
  \`actions = Stack([confirm])\`, \`confirm = Button("Pay now", action="pay")\` and \`pay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})\`
  A Button without \`action\` stays in the page (for example Cancel).
- An Input edits a text state: declare \`$note = ""\` and write \`note = Input($note, label="Note")\`. Send typed values to the backend through McpMutation params. For longer text, such as a message or a bio, set \`lines\` (for example \`lines=4\`).
- Fields can declare checks the app makes before an action that reads them runs: \`required=true\` on an Input, DateInput, Select or Switch (a required Switch must be turned on, for example to accept terms), and on an Input \`format="email"\` (or \`"number"\`, \`"phone"\`, \`"url"\`), \`minLength\` and \`maxLength\`. Declare what the form needs, for example \`email = Input($email, label="Email", required=true, format="email")\`; the app writes the messages.
- There is no styling, HTML or CSS. Choose among the listed values.
- An Image or a ListItem's image shows a picture the app provides: name one from the Images list below. There are no URLs.
- A List holds only ListItems, and a ListItem goes only in a List.
- A DateInput edits a date state written \`"YYYY-MM-DD"\`, or \`""\` for none: declare \`$checkIn = ""\` and write \`checkIn = DateInput($checkIn, label="Check-in")\`. A date range is two DateInputs.
- A Select picks one option and edits a text state: declare \`$size = ""\` and write \`size = Select($size, label="Size", options=["Small", "Large"])\`. A Switch turns a setting on or off and edits a true/false state: \`$news = false\` and \`news = Switch($news, label="Email me order updates")\`. A Select's state starts as \`""\` (nothing chosen) or exactly one of its options. Like an Input, neither calls the backend; send their values through McpMutation params.
- A Table holds only TableRows, one line per row, each with one cell per column: \`orders = Table(["Order", "Total"], [r1])\` and \`r1 = TableRow(["A1B2-7731", 42.5])\`.
- Tabs hold only Tab components, and each Tab has a label and its own children: \`tabs = Tabs([profileTab, alertsTab])\` and \`profileTab = Tab("Profile", [name, bio])\`.
- Charts: a BarChart compares values across categories, a LineChart shows change over time, a PieChart shows parts of a whole. Each Series or Slice goes on its own line, and a Series has one number per label: \`sales = BarChart("Sales by month", ["Jul", "Aug"], [online])\` and \`online = Series("Online", [1200, 1500])\`; \`split = PieChart("Orders by channel", [web])\` and \`web = Slice("Website", 62)\`. Charts carry a title, labels and numbers only (and an optional \`format\`): the app chooses colours, styles and animation.
- A Notice shows a short message in a box: \`tone="warning"\` or \`"danger"\` for problems, \`"success"\` when something worked, \`"info"\` otherwise.
- Use only the components, tools and images listed here. If a request needs something that isn't available, build the closest screen you can with what is.
- Use a tool only for what its name says. If no tool fits an action, use a Button without \`action\` and say in a Text that it isn't available here.
- A Rating shows its own number; don't repeat the value in a Text next to it.
- A Skeleton is only a placeholder for content that is still loading; never use it to stand in for something the catalog doesn't have.

## Components
${COMPONENT_TYPES.map(componentBlock).join("\n\n")}

McpMutation(target, tool=…, [params=…])
  target: id of the Button it governs
  tool: one of the tools below
  params: {name: value or $state, …}
${appComponents.length > 0 ? `
## This app's components
The app adds these components of its own. Use them like the ones above when they fit the request; they follow the same grammar and rules. None has an action of its own: put a Button with an McpMutation next to it or among its children. One whose first argument is a $state edits it, like an Input; declare the state first.

${appComponents.map(appComponentBlock).join("\n\n")}
` : ""}
## Tools
${Object.entries(tools)
  .map(([name, schema]) => describeTool(name, schema))
  .join("\n")}

## Images
${Object.keys(assets).length || patterns.length ? [...Object.keys(assets).map((name) => `- ${name}`), ...patterns.map(patternLine)].join("\n") : "(none: don't use Image)"}

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

function appComponentBlock(component: AppComponents[string]): string {
  const shape = describeAppComponent(component);
  return [`${shape.signature}: ${shape.description}`, ...shape.props.map((p) => `  ${p.name}: ${p.summary}`)].join("\n");
}

/** A family of picture names: usable only with an id the request gives, never an invented one. */
export function patternLine(p: PicturePattern): string {
  const example = p.id === "digits" ? "1042" : "a1b2";
  return `- ${p.prefix}{id}, where {id} is ${p.id === "digits" ? "digits" : "lowercase letters and digits"} (for example ${p.prefix}${example}); use it only with an id the request gives`;
}

function describeTool(name: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema) as JsonSchema;
  const params = Object.entries(json.properties ?? {}).map(([param, def]) => `${param}: ${describeValue(def, true)}`);
  return `- ${name}: params {${params.join("; ")}}`;
}
