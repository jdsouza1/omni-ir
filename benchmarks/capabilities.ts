// What each format lets a model do, with the source for every cell (PLAN-COMPARISON.md, C.4;
// brought up to date and given plain-words answers for the comparison page, PLAN-COMPARE-PAGE.md).
// Read from the pinned sources in benchmarks/sources unless a link says otherwise; Omni-IR's cells
// from this repository. Checked 2026-10-01, updated 2026-10-11.
// Used by docs/COMPARISON.md (generated table), the comparison page and the review page.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CAPABILITY_FORMATS = ["Omni-IR", "OpenUI Lang", "A2UI v0.9", "json-render", "HTML + Tailwind", "React JSX"] as const;

/** Each format in a few everyday words, for someone who has never seen code. */
export const FORMAT_INTROS: readonly string[] = [
  "This project: short plain lines, drawn by your app's own components.",
  "Thesys's compact language for AI-written screens.",
  "Google's format for AI agents, written as JSON.",
  "Vercel's format, written as JSON changes.",
  "Ordinary web page code, styled with Tailwind classes.",
  "Ordinary React code, the way developers write screens by hand.",
];

export interface Cell {
  text: string;
  /** The answer in a few everyday words, for the comparison page. */
  plain: string;
  /** Short source reference: a file in this repo, or a pinned source. */
  source?: string;
}

export interface Row {
  question: string;
  /** The question in everyday words. */
  plain: string;
  /** One sentence on why it matters, in everyday words. */
  why: string;
  cells: readonly Cell[];
}

const OPENUI_SPEC = "sources/openui/specification-v05.mdx";
const OPENUI_PROMPT = "sources/openui/system-prompt.txt";
const OPENUI_README = "sources/openui/repo-README-2026-10-11.md";
const A2UI_PROTOCOL = "sources/a2ui/a2ui_protocol.md";
const A2UI_CATALOG = "sources/a2ui/catalog.json";
const A2UI_README = "sources/a2ui/repo-README-2026-10-11.md";
const A2UI_CONFORMANCE = "sources/a2ui/conformance-README-2026-10-11.md";
const JR = "sources/json-render/README.md";
const JR_CORE = "sources/json-render/core-README-2026-10-11.md";

/** How many language-neutral cases each conformance file holds, counted from the files. */
export function conformanceCounts(root = "conformance"): { cases: number; transport: number; fields: number } {
  const count = (file: string) => {
    const json = JSON.parse(readFileSync(file, "utf8")) as { cases?: unknown[] } | unknown[];
    return Array.isArray(json) ? json.length : (json.cases?.length ?? 0);
  };
  const sum = (dir: string) => readdirSync(join(root, dir)).filter((f) => f.endsWith(".json")).reduce((n, f) => n + count(join(root, dir, f)), 0);
  return { cases: sum("cases"), transport: sum("transport"), fields: sum("fields") };
}
const COUNTS = conformanceCounts();

const NA: Cell = { text: "Not applicable", plain: "Not applicable" };
const CODE: Cell = { text: "Whatever the code does", plain: "Up to the code" };

export const CAPABILITIES: readonly Row[] = [
  {
    question: "Who defines the components",
    plain: "Who decides which building blocks the AI can use?",
    why: "If only your app decides, the AI can't put anything on screen that your app doesn't know how to draw.",
    cells: [
      { text: "The spec's 27 components plus McpMutation, and the app's own components, each declared with its props", plain: "A fixed set, plus your app's own", source: "SPEC.md §6, [5.27]" },
      { text: "The app's library (Zod schemas); 53 components in its benchmark library", plain: "Your app's library", source: OPENUI_SPEC },
      { text: "The catalog named in createSurface: the basic catalog or the app's own", plain: "A basic set, or your app's own", source: A2UI_PROTOCOL },
      { text: "The app's catalog (Zod schemas), or ready-made ones", plain: "Your app's set", source: JR },
      { text: "Any element", plain: "Anything at all" },
      { text: "Any code", plain: "Anything at all" },
    ],
  },
  {
    question: "Markup or scripts from the model",
    plain: "Can the AI send its own code?",
    why: "Code from an AI can do things nobody checked, so it has to be cleaned or locked away first.",
    cells: [
      { text: "No. Text is always drawn as text", plain: "No: text is always shown as text", source: "SPEC.md §8, §11" },
      { text: "No HTML; the default library renders Markdown and code blocks", plain: "No code; formatted text (Markdown) is allowed", source: OPENUI_PROMPT },
      { text: "No; the basic Text allows simple Markdown without HTML, images or links", plain: "No code; simple formatted text", source: A2UI_CATALOG },
      { text: "No; catalog components only", plain: "No", source: JR },
      { text: "Yes: needs sanitizing", plain: "Yes: it has to be cleaned first" },
      { text: "Yes: runs as code, needs a sandbox", plain: "Yes: it runs as code" },
    ],
  },
  {
    question: "Styling from the model",
    plain: "Can the AI choose colours and styles?",
    why: "When it can't, every screen keeps your brand's look.",
    cells: [
      { text: "No: only the catalog's variants and tones; the app's theme sets the colours", plain: "No: it picks from a few named looks", source: "SPEC.md §6" },
      { text: "Variants and sizes from the library", plain: "Named looks and sizes", source: OPENUI_PROMPT },
      { text: "Variants, plus a theme colour (primaryColor) in createSurface", plain: "Named looks, plus a theme colour", source: A2UI_CATALOG },
      { text: "Whatever the catalog's props allow", plain: "Whatever your set allows", source: JR },
      { text: "Any class or style", plain: "Any look it likes" },
      { text: "Any class or style", plain: "Any look it likes" },
    ],
  },
  {
    question: "Pictures",
    plain: "Where do pictures come from?",
    why: "A web address written by an AI can point anywhere, including somewhere that tracks your users.",
    cells: [
      { text: "Names from the app's registry, or names the app looks up, never URLs", plain: "Only pictures your app supplies", source: "SPEC.md §6 (Image), [5.30]" },
      { text: "Any URL (Image, ImageGallery)", plain: "Any web address", source: OPENUI_PROMPT },
      { text: "Any URL (Image, Video, AudioPlayer)", plain: "Any web address", source: A2UI_CATALOG },
      { text: "Whatever the catalog allows", plain: "Whatever your set allows", source: JR },
      { text: "Any URL", plain: "Any web address" },
      { text: "Any URL", plain: "Any web address" },
    ],
  },
  {
    question: "Actions that change data",
    plain: "What happens when someone presses a button that changes something?",
    why: "This is where an AI mistake costs money or deletes data.",
    cells: [
      { text: "Must be wrapped in McpMutation; the tool must be in the app's registry; params checked against the tool's schema by the parser, the browser and the server", plain: "Only actions your app lists, checked three times", source: "SPEC.md §6, §9" },
      { text: "Mutation(\"tool\", args) run by a button; the prompt lists the tools; checking a call is left to the app's tool provider", plain: "Actions by name; checking them is up to your app", source: OPENUI_SPEC },
      { text: "A button sends an event (name and context) to the agent, which handles it", plain: "A message goes to the AI agent, which decides", source: A2UI_PROTOCOL },
      { text: "Named actions declared in the catalog; params are free-form", plain: "Actions your app names; what they send isn't checked", source: JR },
      { text: "Whatever the page's script does", plain: "Up to the code" },
      CODE,
    ],
  },
  {
    question: "Confirmation before a risky action",
    plain: "Can the app make sure people confirm before paying or deleting?",
    why: "A confirmation the AI could leave out isn't a safeguard.",
    cells: [
      { text: "The app marks tools that need confirmation; the renderer asks in its own words, and nothing in the stream can skip, change or imitate it", plain: "Yes: your app decides, and the AI can't skip it", source: "SPEC.md [9.1]–[9.3]" },
      { text: "None in its language spec or prompt that we found", plain: "Not built in", source: OPENUI_SPEC },
      { text: "None in its spec that we found; the agent handles the button's event", plain: "Not built in", source: A2UI_PROTOCOL },
      { text: "An action in the spec can carry confirm, written with the screen", plain: "Yes, but the AI writes it, so it can leave it out", source: JR_CORE },
      { text: "Whatever the page's script does", plain: "Up to the code" },
      CODE,
    ],
  },
  {
    question: "Field checks before sending",
    plain: "Are forms checked before anything is sent?",
    why: "People see and fix a mistake, such as a wrong email address, before it reaches your systems.",
    cells: [
      { text: "required, format (email, number, phone, URL) and length limits, checked by every renderer with its own messages before an action runs; the server checks again", plain: "Yes: required fields, emails, phone numbers, lengths", source: "SPEC.md [5.26], [8.1]–[8.6]" },
      { text: "Form fields take rules such as required, email, min and maxLength", plain: "Yes", source: OPENUI_PROMPT },
      { text: "Inputs and buttons take checks (required, email, regex and more); a failing check disables the button", plain: "Yes", source: A2UI_PROTOCOL },
      { text: "Validation helpers such as check.required() and check.email()", plain: "Yes", source: JR_CORE },
      { text: "The browser's form validation", plain: "Yes, by the browser" },
      CODE,
    ],
  },
  {
    question: "Logic in the stream",
    plain: "Can the AI write logic, like \"if this, then that\"?",
    why: "Logic makes screens smarter, and harder to predict and check.",
    cells: [
      { text: "None: values, references and $state only", plain: "No: only values", source: "SPEC.md §4" },
      { text: "Expressions, ternaries, built-ins such as @Each and @Filter, live Query()", plain: "Yes: formulas, loops and data lookups", source: OPENUI_SPEC },
      { text: "Function calls (formatString, and/or/not, checks)", plain: "Some: built-in functions", source: A2UI_CATALOG },
      { text: "$cond, $template, $computed, visibility conditions, watchers", plain: "Yes: conditions and computed values", source: JR },
      { text: "Scripts", plain: "Yes: anything" },
      { text: "Any", plain: "Yes: anything" },
    ],
  },
  {
    question: "Changing a screen after it arrives",
    plain: "Can a screen change after it appears, like an order moving to \"Delivered\"?",
    why: "Status pages and dashboards need to stay current, and the data should come from your app.",
    cells: [
      { text: "Updates from the app's own code after the stream, checked like new lines; the model never sends them", plain: "Yes: from your app, never from the AI", source: "SPEC.md [10.29]–[10.40]" },
      { text: "Query() reruns a tool on a refresh interval the model writes", plain: "Yes: data the AI asks to refresh on a timer", source: OPENUI_SPEC },
      { text: "The agent can send updateComponents and updateDataModel at any time", plain: "Yes: the AI agent sends changes", source: A2UI_PROTOCOL },
      { text: "The app's state changes what's shown; new patches change the spec", plain: "Yes: through your app's data", source: JR },
      { text: "Whatever the page's script does", plain: "Up to the code" },
      CODE,
    ],
  },
  {
    question: "When drawing can start",
    plain: "When can people start seeing the screen?",
    why: "Seeing something straight away feels much faster than waiting for the whole reply.",
    cells: [
      { text: "After each complete line", plain: "After each line", source: "SPEC.md §3" },
      { text: "Re-parsed on every chunk; references resolve as they arrive", plain: "As the text arrives", source: OPENUI_SPEC },
      { text: "Once the root component's message has arrived", plain: "Once the main part has arrived", source: A2UI_PROTOCOL },
      { text: "After each patch line", plain: "After each change", source: JR },
      { text: "As markup arrives", plain: "As it arrives" },
      { text: "After the whole module compiles", plain: "Only when it's finished" },
    ],
  },
  {
    question: "Native iPhone and Android",
    plain: "Does it draw real iPhone and Android screens?",
    why: "Native screens look and feel like the rest of a phone app.",
    cells: [
      { text: "SwiftUI (iPhone, iPad, Mac) and Jetpack Compose (Android), passing the same conformance cases as the web", plain: "Yes: SwiftUI and Jetpack Compose", source: "swift/, android/" },
      { text: "Web runtimes and email; its README lists mobile, but we found no iOS or Android package in its repository", plain: "No phone renderer found", source: OPENUI_README },
      { text: "Flutter, through Google's GenUI SDK; SwiftUI and Jetpack Compose are on its roadmap", plain: "Through Flutter; native ones planned", source: A2UI_README },
      { text: "React Native", plain: "Through React Native", source: JR },
      { text: "Only inside a web view", plain: "No: web only" },
      { text: "React for the web; React Native uses other components", plain: "No: web only" },
    ],
  },
  {
    question: "Web frameworks",
    plain: "Which kinds of websites can show it?",
    why: "Teams use different tools; one format that works in all of them is easier to adopt.",
    cells: [
      { text: "React, and <omni-screen> for Vue, Svelte, Angular or plain HTML", plain: "Any website", source: "packages/react, packages/elements" },
      { text: "React, Vue, Svelte, Angular, and a no-build browser bundle", plain: "Any website", source: OPENUI_README },
      { text: "Lit, Angular, React", plain: "Most websites", source: A2UI_README },
      { text: "React, Vue, Svelte, Solid; also PDF, email and video", plain: "Most websites, plus PDFs and email", source: JR },
      { text: "Browsers", plain: "Any website" },
      { text: "React", plain: "React websites only" },
    ],
  },
  {
    question: "Inside AI chat apps (MCP Apps)",
    plain: "Can it show screens inside Claude or ChatGPT?",
    why: "More and more people use apps from inside an AI chat.",
    cells: [
      { text: "@omni-ir/mcp: screens inside Claude, ChatGPT, VS Code, Cursor and other MCP Apps hosts, with actions checked by the app's server", plain: "Yes", source: "packages/mcp" },
      { text: "None found; OpenUI Lang can travel inside A2UI", plain: "Not found", source: OPENUI_README },
      { text: "Can travel over MCP as a tool's output; the host must draw A2UI", plain: "Only where the chat app draws A2UI", source: A2UI_PROTOCOL },
      { text: "@json-render/mcp: MCP Apps for Claude, ChatGPT, Cursor and VS Code", plain: "Yes", source: JR },
      { text: "MCP Apps shows HTML in a sandboxed frame", plain: "Yes: chat apps can show web pages in a safe frame" },
      { text: "Not directly", plain: "Not directly" },
    ],
  },
  {
    question: "Written spec",
    plain: "Is there a written rulebook?",
    why: "A rulebook lets anyone build a compatible app, so you're not tied to one company.",
    cells: [
      { text: "Yes: grammar, document rules, issue codes, renderer rules", plain: "Yes", source: "SPEC.md" },
      { text: "Yes: language spec v0.5", plain: "Yes", source: OPENUI_SPEC },
      { text: "Yes: versioned spec with JSON Schemas", plain: "Yes", source: A2UI_PROTOCOL },
      { text: "Documentation and types", plain: "Documentation, not a full rulebook", source: JR },
      { text: "HTML standard", plain: "Yes: the web's own" },
      { text: "JavaScript / React", plain: "Yes: the languages' own" },
    ],
  },
  {
    question: "Shared tests for other implementations",
    plain: "Are there shared tests every version must pass?",
    why: "Shared tests make sure a screen behaves the same on every platform.",
    cells: [
      { text: `${COUNTS.cases} language-neutral conformance cases, plus ${COUNTS.transport} transport and ${COUNTS.fields} field cases; the web, iPhone and Android versions pass them all`, plain: "Yes, passed on web, iPhone and Android", source: "conformance/" },
      { text: "None published that we found", plain: "Not found" },
      { text: "A language-neutral conformance suite for its SDKs, plus spec test cases", plain: "Yes", source: A2UI_CONFORMANCE },
      { text: "None published that we found", plain: "Not found" },
      NA,
      NA,
    ],
  },
  {
    question: "Licence",
    plain: "Is it free to use?",
    why: "An open licence means anyone can use it, change it and build on it.",
    cells: [
      { text: "Apache-2.0", plain: "Yes (Apache-2.0)" },
      { text: "MIT", plain: "Yes (MIT)", source: "sources/openui/LICENSE" },
      { text: "Apache-2.0", plain: "Yes (Apache-2.0)", source: "sources/a2ui/LICENSE" },
      { text: "Apache-2.0", plain: "Yes (Apache-2.0)", source: "sources/json-render/LICENSE" },
      NA,
      NA,
    ],
  },
];

/**
 * Catalog coverage: components with no counterpart in the other library, so a screen using one
 * can't be drawn there without changing what it shows. Components with a close counterpart
 * (TextContent ↔ Text or Heading, Separator ↔ Divider, Tag ↔ Badge, DatePicker ↔ DateInput,
 * TextArea ↔ Input with lines, FormControl and Form ↔ Input in a Stack, and since Step 10: Table and
 * Col ↔ Table and TableRow, Select ↔ Select, SwitchGroup ↔ Switches, Tabs ↔ Tabs, Callout and
 * TextCallout ↔ Notice) are not listed.
 */
export const NO_COUNTERPART: Record<"omni" | "openui", readonly string[]> = {
  // OpenUI components Omni-IR's catalog has nothing for (asked of OpenUI's scenarios).
  openui: [
    "AreaChart", "RadarChart", "RadialChart", "HorizontalBarChart",
    "SingleStackedBarChart", "ScatterChart", "RadioGroup", "CheckBoxGroup", "Slider",
    "Accordion", "Carousel", "Steps", "ImageGallery", "MarkDownRenderer", "CodeBlock",
  ],
  // Omni-IR components OpenUI's benchmark library has nothing for (asked of the model-check screens).
  omni: ["Rating", "List", "ListItem", "Message", "Skeleton"],
};
