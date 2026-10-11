// The system prompt that teaches a model Omni-IR, generated from the schema and the app's own
// registries, so it can never describe a component, prop, enum value, tool or picture the parser
// doesn't accept. No file access and no defaults from any demo: it runs in a browser as well as on a
// server (PLAN-QUICKSTART.md). It's deterministic (no dates, ids or random order), so it can be
// prompt-cached.
import { z } from "zod";
import type { AppComponents, PicturePattern } from "./appComponents.js";
import { describeAppComponent, describeComponent, describeValue, type JsonSchema } from "./describe.js";
import { COMPONENT_TYPES, type ToolRegistry } from "./schema.js";

export interface SystemPromptOptions {
  /** The backend actions a screen may trigger, each with a schema for its params. */
  tools: ToolRegistry;
  /** Pictures the model may name, by name (the same registry the parser and renderer get). */
  assets?: Readonly<Record<string, unknown>>;
  /** The app's own components (defineComponents). */
  components?: AppComponents;
  /** Families of picture names the app looks up when the screen is drawn. */
  pictures?: readonly PicturePattern[];
  /** Parts of a screen the app keeps current, by id or $key, with what each shows. */
  live?: Readonly<Record<string, string>>;
  /** Example screens in Omni-IR, shown to the model; defaults to DEFAULT_PROMPT_EXAMPLES. */
  examples?: readonly string[];
}

/** Example screens that use only the catalog: no tools, no pictures, so they suit any app. */
export const DEFAULT_PROMPT_EXAMPLES: readonly string[] = [
  `root = Card([title, status, details, actions])
title = Heading("Order #A1B2-7731")
status = Badge("Shipped")
details = Text("2 items, arriving Thursday", tone="muted")
actions = Stack([help, close], direction="row")
help = Button("Contact support")
close = Button("Close", variant="secondary")`,
  `root = Card([title, email, news, join])
title = Heading("Stay in touch")
$email = ""
email = Input($email, label="Email", required=true, format="email")
$news = false
news = Switch($news, label="Email me product news")
join = Button("Sign up")`,
];

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const tools = options.tools;
  const assets = options.assets ?? {};
  const appComponents = Object.values(options.components ?? {});
  const patterns = options.pictures ?? [];
  const live = Object.entries(options.live ?? {});
  const examples = options.examples ?? DEFAULT_PROMPT_EXAMPLES;

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
${live.length > 0 ? `## Live parts
The app keeps these parts up to date while the screen is open. When a screen shows one, give it exactly this id or $key; the app changes it later, so write only its first version.
${live.map(([name, what]) => `- ${name}: ${what}`).join("\n")}

` : ""}## Tools
${Object.entries(tools)
  .map(([name, schema]) => describeTool(name, schema))
  .join("\n")}

## Images
${Object.keys(assets).length || patterns.length ? [...Object.keys(assets).map((name) => `- ${name}`), ...patterns.map(patternLine)].join("\n") : "(none: don't use Image)"}

## Examples
${examples.map((example) => `<example>\n${example}\n</example>`).join("\n\n")}
`;
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
