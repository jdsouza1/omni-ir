// What each format lets a model do, with the source for every cell (PLAN-COMPARISON.md, C.4).
// Read from the pinned sources in benchmarks/sources unless a link says otherwise; checked 2026-10-01.
// Used by docs/COMPARISON.md (generated table) and the review page.

export const CAPABILITY_FORMATS = ["Omni-IR", "OpenUI Lang", "A2UI v0.9", "json-render", "HTML + Tailwind", "React JSX"] as const;

export interface Cell {
  text: string;
  /** Short source reference: a file in this repo, or a pinned source. */
  source?: string;
}

export interface Row {
  question: string;
  cells: readonly Cell[];
}

const OPENUI_SPEC = "sources/openui/specification-v05.mdx";
const OPENUI_PROMPT = "sources/openui/system-prompt.txt";
const A2UI_PROTOCOL = "sources/a2ui/a2ui_protocol.md";
const A2UI_CATALOG = "sources/a2ui/catalog.json";
const JR = "sources/json-render/README.md";

export const CAPABILITIES: readonly Row[] = [
  {
    question: "Who defines the components",
    cells: [
      { text: "A fixed catalog in the spec: 22 components plus McpMutation", source: "SPEC.md §6" },
      { text: "The app's library (Zod schemas); 53 components in its benchmark library", source: OPENUI_SPEC },
      { text: "The catalog named in createSurface: the basic catalog or the app's own", source: A2UI_PROTOCOL },
      { text: "The app's catalog (Zod schemas)", source: JR },
      { text: "Any element" },
      { text: "Any code" },
    ],
  },
  {
    question: "Markup or scripts from the model",
    cells: [
      { text: "No. Text is always drawn as text", source: "SPEC.md §8, §11" },
      { text: "No HTML; the default library renders Markdown and code blocks", source: OPENUI_PROMPT },
      { text: "No; the basic Text allows simple Markdown without HTML, images or links", source: A2UI_CATALOG },
      { text: "No; catalog components only", source: JR },
      { text: "Yes: needs sanitizing" },
      { text: "Yes: runs as code, needs a sandbox" },
    ],
  },
  {
    question: "Styling from the model",
    cells: [
      { text: "No: only the catalog's variants and tones", source: "SPEC.md §6" },
      { text: "Variants and sizes from the library", source: OPENUI_PROMPT },
      { text: "Variants, plus a theme colour (primaryColor) in createSurface", source: A2UI_CATALOG },
      { text: "Whatever the catalog's props allow", source: JR },
      { text: "Any class or style" },
      { text: "Any class or style" },
    ],
  },
  {
    question: "Pictures",
    cells: [
      { text: "Names from the app's registry, never URLs", source: "SPEC.md §6 (Image)" },
      { text: "Any URL (Image, ImageGallery)", source: OPENUI_PROMPT },
      { text: "Any URL (Image, Video, AudioPlayer)", source: A2UI_CATALOG },
      { text: "Whatever the catalog allows", source: JR },
      { text: "Any URL" },
      { text: "Any URL" },
    ],
  },
  {
    question: "Actions that change data",
    cells: [
      { text: "Must be wrapped in McpMutation; the tool must be in the app's registry; params checked against the tool's schema by the parser, the browser and the server", source: "SPEC.md §6, §9" },
      { text: "Mutation(\"tool\", args) run by a button; the prompt lists the tools; checking a call is left to the app's tool provider", source: OPENUI_SPEC },
      { text: "A button sends an event (name and context) to the agent, which handles it", source: A2UI_PROTOCOL },
      { text: "Named actions declared in the catalog; params are free-form", source: JR },
      { text: "Whatever the page's script does" },
      { text: "Whatever the code does" },
    ],
  },
  {
    question: "Logic in the stream",
    cells: [
      { text: "None: values, references and $state only", source: "SPEC.md §4" },
      { text: "Expressions, ternaries, built-ins such as @Each and @Filter, live Query()", source: OPENUI_SPEC },
      { text: "Function calls (formatString, and/or/not, checks)", source: A2UI_CATALOG },
      { text: "$cond, $template, $computed, visibility conditions, watchers", source: JR },
      { text: "Scripts" },
      { text: "Any" },
    ],
  },
  {
    question: "When drawing can start",
    cells: [
      { text: "After each complete line", source: "SPEC.md §3" },
      { text: "Re-parsed on every chunk; references resolve as they arrive", source: OPENUI_SPEC },
      { text: "Once the root component's message has arrived", source: A2UI_PROTOCOL },
      { text: "After each patch line", source: JR },
      { text: "As markup arrives" },
      { text: "After the whole module compiles" },
    ],
  },
  {
    question: "Written spec",
    cells: [
      { text: "Yes: grammar, document rules, issue codes, renderer rules", source: "SPEC.md" },
      { text: "Yes: language spec v0.5", source: OPENUI_SPEC },
      { text: "Yes: versioned spec with JSON Schemas", source: A2UI_PROTOCOL },
      { text: "Documentation and types", source: JR },
      { text: "HTML standard" },
      { text: "JavaScript / React" },
    ],
  },
  {
    question: "Shared tests for other implementations",
    cells: [
      { text: "73 language-neutral conformance cases", source: "conformance/" },
      { text: "None published that we found" },
      { text: "Spec test cases (specification/v0_9/test)", source: "a2ui-project/a2ui" },
      { text: "None published that we found" },
      { text: "Not applicable" },
      { text: "Not applicable" },
    ],
  },
  {
    question: "Renderers",
    cells: [
      { text: "React, SwiftUI, Jetpack Compose: all three pass the conformance cases", source: "packages/, swift/, android/" },
      { text: "React, Vue, Svelte, Angular", source: "thesysdev/openui packages/" },
      { text: "Lit, Angular, React, Flutter", source: "a2ui.org" },
      { text: "React, Vue, Svelte, Solid, React Native, and PDF, email, video and terminal", source: JR },
      { text: "Browsers" },
      { text: "React" },
    ],
  },
  {
    question: "Licence",
    cells: [
      { text: "Apache-2.0" },
      { text: "MIT", source: "sources/openui/LICENSE" },
      { text: "Apache-2.0", source: "sources/a2ui/LICENSE" },
      { text: "Apache-2.0", source: "sources/json-render/LICENSE" },
      { text: "Not applicable" },
      { text: "Not applicable" },
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
    "BarChart", "LineChart", "AreaChart", "PieChart", "RadarChart", "RadialChart", "HorizontalBarChart",
    "SingleStackedBarChart", "ScatterChart", "RadioGroup", "CheckBoxGroup", "Slider",
    "Accordion", "Carousel", "Steps", "ImageGallery", "MarkDownRenderer", "CodeBlock",
  ],
  // Omni-IR components OpenUI's benchmark library has nothing for (asked of the model-check screens).
  omni: ["Rating", "List", "ListItem", "Message", "Skeleton"],
};
