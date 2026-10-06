// The Omni-IR conformance cases, written here so Omni-IR text can be quoted literally (String.raw).
// `npm run conformance:build` writes them to conformance/cases/*.json, the language-neutral files other
// implementations use. Expected results are written by hand from SPEC.md, never copied from this
// implementation's output. The `catalog` cases are generated from conformance/schema.json (see catalog.ts).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { catalogCases } from "./catalog";

export type InputPart = string | { repeat: string; times: number };
export interface ExpectedIssue {
  line: number | null;
  code: string;
}
export interface ConformanceCase {
  id: string;
  /** SPEC.md rule ids this case checks. */
  rules: string[];
  description: string;
  /** The stream: a string, or parts joined in order ({repeat, times} builds a long run of text). */
  input: string | InputPart[];
  /** Tool names in the registry; defaults to ["payments.confirm"]. Params are not checked by the parser. */
  tools?: string[];
  /** Picture names in the asset registry; defaults to none. Renderers map names to pictures; the parser needs only the names. */
  assets?: string[];
  expect: {
    /** Every issue reported, in any order. Always compared. */
    issues: ExpectedIssue[];
    /** Compared only when present: accepted components by id. */
    nodes?: Record<string, { type: string; props: Record<string, unknown>; children: string[] }>;
    /** Compared only when present: declared state at end of stream. */
    state?: Record<string, unknown>;
    /** Compared only when present: McpMutations by the id of the Button they govern. */
    mutations?: Record<string, { id: string; tool: string; params: Record<string, unknown> }>;
    /** Compared only when present: references still pending at end of stream, sorted. */
    missing?: string[];
  };
}

const i = (line: number | null, code: string): ExpectedIssue => ({ line, code });
const lines = (...l: string[]) => l.join("\n") + "\n";
const st = (key: string) => ({ state: key });
const node = (type: string, props: Record<string, unknown> = {}, children: string[] = []) => ({ type, props, children });

export const CASES: Record<string, ConformanceCase[]> = {
  stream: [
    {
      id: "stream-utf8",
      rules: ["3.1", "3.3"],
      description: "Multi-byte characters decode correctly however the bytes are split.",
      input: lines(`root = Text("Café ☕ 日本")`),
      expect: { issues: [], nodes: { root: node("Text", { text: "Café ☕ 日本" }) } },
    },
    {
      id: "stream-crlf",
      rules: ["3.2"],
      description: "\\r\\n line endings behave like \\n.",
      input: "root = Stack([a])\r\na = Divider()\r\n",
      expect: { issues: [], nodes: { root: node("Stack", {}, ["a"]), a: node("Divider") } },
    },
    {
      id: "stream-no-final-newline",
      rules: ["3.4"],
      description: "A last line without a line ending is processed at end of stream.",
      input: "root = Divider()",
      expect: { issues: [], nodes: { root: node("Divider") } },
    },
    {
      id: "stream-line-numbers",
      rules: ["3.5", "3.6", "7.2", "7.4"],
      description: "Blank and comment lines count toward line numbers.",
      input: lines("# a comment", "", "root = Stack([a])", "   ", "b = Nope()", "a = Divider()"),
      expect: { issues: [i(5, "unknown_component")] },
    },
    {
      id: "stream-only-comments",
      rules: ["3.6"],
      description: "Comment-only and whitespace-only lines are ignored.",
      input: lines("# just a comment", "   # indented comment", "\t"),
      expect: { issues: [i(null, "missing_root")], nodes: {} },
    },
    {
      id: "stream-line-too-long",
      rules: ["3.7", "3.8"],
      description: "An over-long line is reported and skipped; the next line is processed.",
      input: ["root = Stack([a])\nt = Text(\"", { repeat: "x", times: 17000 }, "\")\na = Divider()\n"],
      expect: { issues: [i(2, "line_too_long")], nodes: { root: node("Stack", {}, ["a"]), a: node("Divider") } },
    },
    {
      id: "stream-continues-after-error",
      rules: ["3.8", "7.1"],
      description: "An error rejects only its own line.",
      input: lines("root = Stack([a, b])", "a = Text('bad')", "b = Divider()", "a = Divider()"),
      expect: { issues: [i(2, "syntax")], nodes: { root: node("Stack", {}, ["a", "b"]), a: node("Divider"), b: node("Divider") } },
    },
  ],

  grammar: [
    {
      id: "grammar-statements",
      rules: ["4.1"],
      description: "Component and state statements.",
      input: lines("root = Stack([t])", '$name = "Ada"', "t = Text($name)"),
      expect: {
        issues: [],
        nodes: { root: node("Stack", {}, ["t"]), t: node("Text", { text: st("$name") }) },
        state: { $name: "Ada" },
      },
    },
    {
      id: "grammar-double-equals",
      rules: ["4.1"],
      description: "== is not an assignment.",
      input: lines("root == Divider()"),
      expect: { issues: [i(1, "syntax"), i(null, "missing_root")] },
    },
    {
      id: "grammar-whitespace",
      rules: ["4.2"],
      description: "Spaces and tabs at line ends and between tokens don't matter.",
      input: lines('  root\t=\tStack( [ a ,b ] , gap = "sm" )  ', "a=Divider()", "b = Divider()"),
      expect: { issues: [], nodes: { root: node("Stack", { gap: "sm" }, ["a", "b"]), a: node("Divider"), b: node("Divider") } },
    },
    {
      id: "grammar-positional-after-named",
      rules: ["4.3"],
      description: "A positional argument after a named one is a syntax error.",
      input: lines('root = Text(tone="muted", "hi")'),
      expect: { issues: [i(1, "syntax"), i(null, "missing_root")] },
    },
    {
      id: "grammar-trailing-commas",
      rules: ["4.3", "4.11"],
      description: "Trailing commas are allowed in argument lists and lists.",
      input: lines('root = Stack([a, b,], direction="row",)', "a = Divider()", "b = Divider()"),
      expect: { issues: [], nodes: { root: node("Stack", { direction: "row" }, ["a", "b"]), a: node("Divider"), b: node("Divider") } },
    },
    {
      id: "grammar-bare-value",
      rules: ["4.4"],
      description: "A component statement must be a call.",
      input: lines("root = 5"),
      expect: { issues: [i(1, "syntax"), i(null, "missing_root")] },
    },
    {
      id: "grammar-trailing-text",
      rules: ["4.4", "4.8"],
      description: "Text after the call is an error; a trailing comment is not.",
      input: lines('root = Text("a") extra', 't = Text("b")   # a trailing comment'),
      expect: { issues: [i(1, "syntax"), i(null, "missing_root")], nodes: { t: node("Text", { text: "b" }) } },
    },
    {
      id: "strings-escapes",
      rules: ["4.5"],
      description: '\\", \\\\ and \\n are decoded.',
      input: lines(String.raw`root = Text("She said \"hi\" \\ ok\nnext")`),
      expect: { issues: [], nodes: { root: node("Text", { text: 'She said "hi" \\ ok\nnext' }) } },
    },
    {
      id: "strings-single-quotes",
      rules: ["4.5"],
      description: "Single-quoted strings are a syntax error.",
      input: lines("root = Text('hi')"),
      expect: { issues: [i(1, "syntax"), i(null, "missing_root")] },
    },
    {
      id: "strings-unknown-escape",
      rules: ["4.6", "7.1"],
      description: "An unknown escape is kept as literal text with a warning; the line is accepted.",
      input: lines(String.raw`root = Text("Path: C:\data")`),
      expect: { issues: [i(1, "unknown_escape")], nodes: { root: node("Text", { text: "Path: C:\\data" }) } },
    },
    {
      id: "strings-unterminated",
      rules: ["4.7"],
      description: "A missing closing quote, including one hidden by \\\", is an error.",
      input: lines(String.raw`root = Text("oops)`, String.raw`t = Text("ends with \")`),
      expect: { issues: [i(1, "unterminated_string"), i(2, "unterminated_string"), i(null, "missing_root")] },
    },
    {
      id: "strings-special-characters",
      rules: ["4.8"],
      description: "Inside a string, # $ , ( ) [ ] { } = are text.",
      input: lines(String.raw`root = Text("# not a comment, (really) [x] {y} = $5")  # a real comment`),
      expect: { issues: [], nodes: { root: node("Text", { text: "# not a comment, (really) [x] {y} = $5" }) } },
    },
    {
      id: "numbers",
      rules: ["4.9"],
      description: "Integers, decimals, a leading point, a trailing point and exponents.",
      input: lines("$a = 42", "$b = -1.5e2", "$c = .5", "$d = 3.", "root = Divider()"),
      expect: { issues: [], state: { $a: 42, $b: -150, $c: 0.5, $d: 3 } },
    },
    {
      // Found by the differential fuzz corpus (PLAN-HARDENING.md B.2): Kotlin kept -0.0 where the
      // other parsers' results said 0, and a renderer could show "-0".
      id: "numbers-negative-zero",
      rules: ["4.9"],
      description: "Negative zero, in any spelling and from underflow, is the number 0.",
      input: lines("$a = -0", "$b = -0.0", "$c = -0e5", "$d = -1e-400", "root = Text($a)"),
      expect: { issues: [], state: { $a: 0, $b: 0, $c: 0, $d: 0 } },
    },
    {
      id: "numbers-invalid",
      rules: ["4.9"],
      description: "A number followed by a letter, and a number too large to be finite.",
      input: lines("$x = 1abc", "$y = 1e999", "root = Divider()"),
      expect: { issues: [i(1, "syntax"), i(2, "invalid_props")], state: {} },
    },
    {
      id: "ids-invalid",
      rules: ["4.10"],
      description: "An id must be an identifier and not a reserved word.",
      input: lines("1abc = Divider()", "true = Divider()", "constructor = Divider()", "root = Divider()"),
      expect: { issues: [i(1, "syntax"), i(2, "invalid_props"), i(3, "invalid_props")], nodes: { root: node("Divider") } },
    },
    {
      id: "literals",
      rules: ["4.10"],
      description: "true, false and null are literals in values.",
      input: lines("$yes = true", "$no = false", "$none = null", "root = Divider()"),
      expect: { issues: [], state: { $yes: true, $no: false, $none: null } },
    },
    {
      id: "lists-and-objects",
      rules: ["4.11", "5.16"],
      description: "An object of params with identifier and string keys, literals and state.",
      input: lines(
        'root = Button("Pay", action="pay")',
        "$amount = 3",
        'm = McpMutation(root, tool="payments.confirm", params={amount: $amount, note: "", "ok": true,})',
      ),
      expect: {
        issues: [],
        mutations: { root: { id: "m", tool: "payments.confirm", params: { amount: st("$amount"), note: "", ok: true } } },
      },
    },
    {
      id: "not-flat",
      rules: ["4.12"],
      description: "A call inside any value is rejected.",
      input: lines('root = Card([Heading("Hi")])', '$x = Text("a")', 't = Button("x", action=Text("y"))'),
      expect: { issues: [i(1, "not_flat"), i(2, "not_flat"), i(3, "not_flat"), i(null, "missing_root")] },
    },
  ],

  document: [
    {
      id: "root-missing",
      rules: ["5.1"],
      description: "A stream without root.",
      input: lines("a = Divider()"),
      expect: { issues: [i(null, "missing_root")] },
    },
    {
      id: "root-not-component",
      rules: ["5.1", "7.2"],
      description: "root defined as an McpMutation.",
      input: lines('b = Button("Pay", action="pay")', 'root = McpMutation(b, tool="payments.confirm")'),
      expect: { issues: [i(2, "root_not_component")] },
    },
    {
      id: "forward-references",
      rules: ["5.2"],
      description: "Children may arrive later and in any order; the list order is kept.",
      input: lines("root = Stack([a, b])", "b = Divider()", "a = Divider()"),
      expect: { issues: [], nodes: { root: node("Stack", {}, ["a", "b"]), a: node("Divider"), b: node("Divider") }, missing: [] },
    },
    {
      id: "duplicate-ids",
      rules: ["5.3"],
      description: "A second assignment is rejected and the first stays.",
      input: lines('root = Text("first")', 'root = Text("second")', "$x = 1", "$x = 2"),
      expect: { issues: [i(2, "duplicate_id"), i(4, "duplicate_id")], nodes: { root: node("Text", { text: "first" }) }, state: { $x: 1 } },
    },
    {
      id: "one-parent",
      rules: ["5.4", "5.7", "7.2"],
      description: "A second parent and a repeated child are rejected.",
      input: lines("root = Stack([a, b])", "a = Stack([c])", "b = Stack([c])", "c = Divider()", "d = Stack([e, e])"),
      expect: { issues: [i(1, "dangling_ref"), i(3, "multiple_parents"), i(5, "duplicate_child")], missing: ["b"] },
    },
    {
      id: "cycle-and-root-as-child",
      rules: ["5.5"],
      description: "A cycle, and root listed as a child.",
      input: lines("x = Stack([y])", "y = Stack([x])", "root = Divider()", "c = Stack([root])"),
      expect: { issues: [i(1, "dangling_ref"), i(2, "cycle"), i(4, "root_as_child")] },
    },
    {
      id: "child-not-component",
      rules: ["5.6", "7.2"],
      description: "A children list naming an McpMutation.",
      input: lines("root = Stack([m])", 'b = Button("Pay", action="pay")', 'm = McpMutation(b, tool="payments.confirm")'),
      expect: { issues: [i(1, "dangling_ref"), i(2, "ungoverned_mutation"), i(3, "child_not_component")] },
    },
    {
      id: "rejected-line-has-no-effect",
      rules: ["5.7", "7.3"],
      description: "A rejected line's id stays pending and ends up missing.",
      input: lines("root = Stack([a])", 'a = Nope("x")'),
      expect: { issues: [i(1, "dangling_ref"), i(2, "unknown_component")], missing: ["a"] },
    },
    {
      id: "positional-arguments",
      rules: ["5.8"],
      description: "Too many positional arguments, a prop given twice, a named prop repeated.",
      input: lines("root = Divider()", 'a = Text("x", "y")', 'b = Text("x", text="y")', 'c = Text("x", tone="muted", tone="strong")', 'd = Divider("x")'),
      expect: { issues: [i(2, "invalid_props"), i(3, "invalid_props"), i(4, "invalid_props"), i(5, "invalid_props")] },
    },
    {
      id: "catalog-props",
      rules: ["5.9"],
      description: "An unknown component, an unknown prop and a value outside the allowed list.",
      input: lines("root = Divider()", 'a = Marquee("x")', 'b = Text("x", style="color:red")', 'c = Stack([], direction="diagonal")'),
      expect: { issues: [i(2, "unknown_component"), i(3, "invalid_props"), i(4, "invalid_props")] },
    },
    {
      id: "state-values",
      rules: ["5.10"],
      description: "State holds only strings, numbers, booleans and null.",
      input: lines("$a = [1]", "$b = {x: 1}", "$c = other", "root = Divider()"),
      expect: { issues: [i(1, "invalid_props"), i(2, "invalid_props"), i(3, "invalid_props")], state: {} },
    },
    {
      id: "state-references",
      rules: ["5.11", "7.2", "7.3"],
      description: "A used key that's never declared is reported on the line that uses it.",
      input: lines("root = Stack([t, i])", "t = Text($never)", '$name = ""', 'i = Input($name, label="Name")'),
      expect: { issues: [i(2, "missing_state")], missing: ["$never"] },
    },
    {
      id: "input-state-type",
      rules: ["5.12"],
      description: "An Input bound to non-text state, in both arrival orders.",
      input: lines("$n = 3", 'root = Input($n, label="N")', 'other = Input($s, label="S")', "$s = 4"),
      expect: { issues: [i(null, "missing_root"), i(2, "input_state_type"), i(3, "missing_state"), i(4, "input_state_type")] },
    },
    {
      id: "governance",
      rules: ["5.13", "7.2", "7.4"],
      description: "A second McpMutation for one Button, and a Button with an action but none.",
      input: lines(
        "root = Stack([pay, cancel, refund])",
        'pay = Button("Pay", action="pay")',
        'cancel = Button("Cancel")',
        'm1 = McpMutation(pay, tool="payments.confirm")',
        'm2 = McpMutation(pay, tool="payments.confirm")',
        'refund = Button("Refund", action="refund")',
      ),
      expect: { issues: [i(5, "duplicate_mutation"), i(6, "ungoverned_mutation")] },
    },
    {
      id: "unknown-tool",
      rules: ["5.14"],
      description: "A tool outside the registry, and a badly shaped tool name.",
      input: lines('root = Button("Pay", action="pay")', 'm = McpMutation(root, tool="system.delete_account")', 'n = McpMutation(root, tool="no dots")'),
      expect: { issues: [i(1, "ungoverned_mutation"), i(2, "unknown_tool"), i(3, "invalid_props")], mutations: {} },
    },
    {
      id: "mutation-targets",
      rules: ["5.15", "7.2"],
      description: "A target without an action, and a target that never arrives.",
      input: lines("root = Stack([cancel])", 'cancel = Button("Cancel")', 'm = McpMutation(cancel, tool="payments.confirm")', 'n = McpMutation(ghost, tool="payments.confirm")'),
      expect: { issues: [i(3, "mutation_target_not_interactive"), i(4, "dangling_ref")] },
    },
    {
      id: "params-rules",
      rules: ["5.16"],
      description: "A component id as a value, a repeated key and a reserved key are rejected.",
      input: lines(
        'root = Button("Pay", action="pay")',
        'a = McpMutation(root, tool="payments.confirm", params={x: root})',
        'b = McpMutation(root, tool="payments.confirm", params={x: 1, x: 2})',
        'c = McpMutation(root, tool="payments.confirm", params={__proto__: 1})',
        'd = McpMutation(root, tool="payments.confirm", params={note: ""})',
      ),
      expect: {
        issues: [i(2, "invalid_props"), i(3, "invalid_props"), i(4, "invalid_props")],
        mutations: { root: { id: "d", tool: "payments.confirm", params: { note: "" } } },
      },
    },
    {
      id: "image-assets",
      rules: ["5.17", "7.2"],
      description: "Images name registry pictures. A URL is not an asset name; an unregistered name is unknown_asset.",
      assets: ["cabin-pines", "tote"],
      input: lines(
        "root = Stack([photo, items])",
        'photo = Image("cabin-pines", alt="A cabin", ratio="16:9")',
        'x = Image("https://tracker.example/pixel.gif", alt="x")',
        'y = Image("not-registered", alt="y")',
        "items = List([tote])",
        'tote = ListItem("Tote", trailing="$86.00", image="tote")',
        'z = ListItem("Shirt", image="shirt")',
      ),
      expect: {
        issues: [i(3, "invalid_props"), i(4, "unknown_asset"), i(7, "unknown_asset")],
        nodes: {
          root: node("Stack", {}, ["photo", "items"]),
          photo: node("Image", { asset: "cabin-pines", alt: "A cabin", ratio: "16:9" }),
          items: node("List", {}, ["tote"]),
          tote: node("ListItem", { title: "Tote", trailing: "$86.00", image: "tote" }),
        },
      },
    },
    {
      id: "image-no-registry",
      rules: ["5.17"],
      description: "With an empty asset registry, every Image is rejected.",
      input: lines('root = Image("cabin-pines", alt="A cabin")'),
      expect: { issues: [i(1, "unknown_asset"), i(null, "missing_root")], nodes: {} },
    },
    {
      id: "list-children",
      rules: ["5.18"],
      description: "A List may hold only ListItems, whichever line arrives first.",
      input: lines("root = Stack([a, b])", "a = List([t])", 't = Text("not an item")', 'u = Text("early")', "b = List([u])"),
      expect: { issues: [i(3, "list_mismatch"), i(5, "list_mismatch"), i(1, "dangling_ref"), i(2, "dangling_ref")] },
    },
    {
      id: "list-item-parent",
      rules: ["5.18"],
      description: "A ListItem must sit inside a List.",
      input: lines("root = Stack([i])", 'i = ListItem("Tote")'),
      expect: { issues: [i(2, "list_mismatch"), i(1, "dangling_ref")] },
    },
    {
      id: "date-input-state",
      rules: ["5.7", "5.11", "5.19"],
      description: "A DateInput's state holds a YYYY-MM-DD date or the empty string. The rejected $c line has no effect, so c's state is never declared.",
      input: lines(
        "root = Stack([a, b, c])",
        '$a = ""',
        'a = DateInput($a, label="A", min="2026-10-01")',
        '$b = "2026-10-14"',
        'b = DateInput($b, label="B")',
        'c = DateInput($c, label="C")',
        '$c = "next Tuesday"',
      ),
      expect: {
        issues: [i(6, "missing_state"), i(7, "input_state_type")],
        state: { $a: "", $b: "2026-10-14" },
      },
    },
    {
      id: "select-switch-state",
      rules: ["5.7", "5.11", "5.20"],
      description: "A Select edits text state and a Switch true/false state. A Select value that isn't one of its options is allowed. Rejected lines have no effect.",
      input: lines(
        "root = Stack([a, b, c, d])",
        '$size = "XL"',
        'a = Select($size, label="Size", options=["S", "M"])',
        "$news = true",
        'b = Switch($news, label="News")',
        '$flag = "yes"',
        'c = Switch($flag, label="Flag")',
        "$count = 2",
        'd = Select($count, label="Count", options=["1", "2"])',
      ),
      expect: {
        issues: [i(7, "input_state_type"), i(9, "input_state_type"), i(1, "dangling_ref")],
        state: { $size: "XL", $news: true, $flag: "yes", $count: 2 },
      },
    },
    {
      id: "table-rows",
      rules: ["5.21"],
      description: "A Table holds only TableRows, each with one cell per column, whichever line arrives first; a TableRow sits only in a Table.",
      input: lines(
        "root = Stack([t, u, loose])",
        't = Table(["Plan", "Price"], [a, b, x])',
        'a = TableRow(["Basic", 12])',
        'b = TableRow(["Pro"])',
        'x = Text("not a row")',
        'early = TableRow(["One", "Two", "Three"])',
        'u = Table(["A", "B"], [early])',
        'loose = TableRow(["Alone"])',
      ),
      expect: {
        issues: [i(4, "table_mismatch"), i(5, "table_mismatch"), i(7, "table_mismatch"), i(8, "table_mismatch"), i(1, "dangling_ref"), i(2, "dangling_ref")],
      },
    },
    {
      id: "tabs-children",
      rules: ["5.22"],
      description: "A Tabs holds only Tab components, and a Tab sits only in a Tabs; a Tab holds any components.",
      input: lines(
        "root = Stack([tabs, stray])",
        "tabs = Tabs([one, two, x])",
        'one = Tab("Profile", [t])',
        't = Text("Hello")',
        'two = Tab("Alerts", [])',
        'x = Text("not a tab")',
        'stray = Tab("Lost", [])',
      ),
      expect: {
        issues: [i(6, "tabs_mismatch"), i(7, "tabs_mismatch"), i(1, "dangling_ref"), i(2, "dangling_ref")],
      },
    },
    {
      id: "chart-children",
      rules: ["5.23"],
      description: "Bar and line charts hold only Series with one value per label, a pie chart only Slices, whichever line arrives first; a Series or Slice sits only in its kind of chart.",
      input: lines(
        "root = Stack([bars, line, pie, loose])",
        'bars = BarChart("Sales", ["Jul", "Aug"], [a, b, w])',
        'a = Series("Online", [120, 150])',
        'b = Series("In store", [90])',
        'w = Slice("Wrong", 1)',
        'early = Series("Visitors", [1, 2, 3])',
        'line = LineChart("Visits", ["W1", "W2"], [early])',
        'pie = PieChart("Channels", [web, s])',
        'web = Slice("Website", 62)',
        's = Series("Wrong", [1])',
        'loose = Slice("Alone", 5)',
      ),
      expect: {
        issues: [
          i(4, "chart_mismatch"),
          i(5, "chart_mismatch"),
          i(7, "chart_mismatch"),
          i(10, "chart_mismatch"),
          i(11, "chart_mismatch"),
          i(1, "dangling_ref"),
          i(2, "dangling_ref"),
          i(8, "dangling_ref"),
        ],
      },
    },
    {
      id: "chart-data-only",
      rules: ["5.24"],
      description: "A chart carries data only: styling props on a chart, Series or Slice are rejected, as is a negative Slice.",
      input: lines(
        "root = Stack([bars, pie])",
        'bars = BarChart("Sales", ["Jul"], [a], color="red")',
        'bars = BarChart("Sales", ["Jul"], [a], format="currency", currency="USD")',
        'a = Series("Online", [120], style="dashed")',
        'a = Series("Online", [120])',
        'pie = PieChart("Channels", [web], animation="spin")',
        'pie = PieChart("Channels", [web, app], format="percent")',
        'web = Slice("Website", 62, tooltip="62% of orders")',
        'web = Slice("Website", 62)',
        'app = Slice("App", -5)',
      ),
      expect: {
        issues: [i(2, "invalid_props"), i(4, "invalid_props"), i(6, "invalid_props"), i(8, "invalid_props"), i(10, "invalid_props"), i(7, "dangling_ref")],
      },
    },
    {
      id: "rating-max",
      rules: ["5.9"],
      description: "A Rating's number must not be more than max, which is 5 when absent (schema.json crossPropRules). A $state value is not checked.",
      input: lines(
        "root = Stack([a, b, c])",
        "$score = 9",
        "a = Rating(4.96)",
        "b = Rating(8, max=10)",
        "c = Rating($score)",
        "d = Rating(6)",
        "e = Rating(11, max=10)",
      ),
      expect: {
        issues: [i(6, "invalid_props"), i(7, "invalid_props")],
        nodes: {
          root: node("Stack", {}, ["a", "b", "c"]),
          a: node("Rating", { value: 4.96 }),
          b: node("Rating", { value: 8, max: 10 }),
          c: node("Rating", { value: st("$score") }),
        },
      },
    },
  ],
  catalog: catalogCases(),
};

/** The JSON files, by name. */
export function renderCaseFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(CASES).map(([area, cases]) => [`${area}.json`, JSON.stringify({ area, cases }, null, 2) + "\n"]),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = resolve("conformance", "cases");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(renderCaseFiles())) writeFileSync(join(dir, name), text);
  console.log(`wrote ${Object.values(CASES).flat().length} cases to conformance/cases/`);
}
