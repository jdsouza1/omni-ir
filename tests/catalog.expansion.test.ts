// Step 10: Select, Switch, Table/TableRow, Tabs/Tab and Notice (PLAN-CATALOG.md). Protocol rules only;
// rendering is covered in components.expansion.test.tsx.
import { createParser, validateStatement } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { arr, bool, call, num, ref, st, str } from "./helpers";

const ctx = { tools: TOOLS, assets: Object.keys(ASSETS) };
const codes = (raw: Parameters<typeof validateStatement>[0]): string[] => {
  const r = validateStatement(raw, ctx);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

/** Issues for a whole stream, as "line:code" (end-of-stream issues carry the line of the id they're about). */
function issues(...lines: string[]): string[] {
  const parser = createParser({ tools: TOOLS, assets: ASSETS });
  const out: string[] = [];
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") out.push(`${e.issue.line ?? "end"}:${e.issue.code}`);
  });
  parser.write(lines.join("\n") + "\n");
  parser.end();
  return out;
}

const texts = (n: number) => arr(...Array.from({ length: n }, (_, i) => str(`Option ${i + 1}`)));

describe("Select", () => {
  it("accepts a label, options and a placeholder", () => {
    expect(codes(call("s", "Select", [st("$size")], { label: str("Size"), options: arr(str("Small"), str("Large")), placeholder: str("Choose a size") }))).toEqual([]);
  });

  it.each([
    ["no options", { label: str("Size"), options: arr() }],
    ["51 options", { label: str("Size"), options: texts(51) }],
    ["a number option", { label: str("Size"), options: arr(str("S"), num(2)) }],
    ["no label", { options: arr(str("S")) }],
    ["an empty label", { label: str(""), options: arr(str("S")) }],
  ])("rejects %s", (_, named) => {
    expect(codes(call("s", "Select", [st("$size")], named))).toContain("invalid_props");
  });

  it("edits text state: a Select bound to a boolean is input_state_type", () => {
    expect(issues("root = Stack([s])", "$size = true", 's = Select($size, label="Size", options=["S", "M"])')).toEqual(["3:input_state_type"]);
    expect(issues("root = Stack([s])", '$size = "M"', 's = Select($size, label="Size", options=["S", "M"])')).toEqual([]);
  });

  it("allows a value that isn't one of the options (it shows as nothing chosen)", () => {
    expect(issues("root = Stack([s])", '$size = "XL"', 's = Select($size, label="Size", options=["S", "M"])')).toEqual([]);
  });
});

describe("Switch", () => {
  it("accepts a label", () => {
    expect(codes(call("w", "Switch", [st("$news")], { label: str("Email me updates") }))).toEqual([]);
  });

  it("rejects a literal value instead of state", () => {
    expect(codes(call("w", "Switch", [bool(true)], { label: str("Email me updates") }))).toContain("invalid_props");
  });

  it("edits true/false state: a Switch bound to text is input_state_type", () => {
    expect(issues("root = Stack([w])", '$news = "yes"', 'w = Switch($news, label="News")')).toEqual(["3:input_state_type"]);
    expect(issues("root = Stack([w])", "$news = false", 'w = Switch($news, label="News")')).toEqual([]);
  });
});

describe("Table and TableRow", () => {
  it("accepts columns, rows and text or number cells", () => {
    expect(codes(call("t", "Table", [arr(str("Plan"), str("Price")), arr(ref("a"), ref("b"))]))).toEqual([]);
    expect(codes(call("a", "TableRow", [arr(str("Basic"), num(12))]))).toEqual([]);
  });

  it.each([
    ["no columns", call("t", "Table", [arr(), arr()])],
    ["9 columns", call("t", "Table", [texts(9), arr()])],
    ["a number column heading", call("t", "Table", [arr(num(1)), arr()])],
    ["a row with no cells", call("a", "TableRow", [arr()])],
    ["a row with 9 cells", call("a", "TableRow", [texts(9)])],
    ["a true/false cell", call("a", "TableRow", [arr(str("x"), bool(true))])],
  ])("rejects %s", (_, raw) => {
    expect(codes(raw)).toContain("invalid_props");
  });

  it("streams a table row by row", () => {
    expect(
      issues("root = Table([\"Plan\", \"Price\"], [a, b])", 'a = TableRow(["Basic", "$12"])', 'b = TableRow(["Pro", "$29"])'),
    ).toEqual([]);
  });

  it("a row must have one cell per column (table_mismatch), whichever line arrives first", () => {
    expect(issues('root = Table(["Plan", "Price"], [a])', 'a = TableRow(["Basic"])')).toEqual(["2:table_mismatch", "1:dangling_ref"]);
    expect(issues("root = Stack([t])", 'a = TableRow(["Basic"])', 't = Table(["Plan", "Price"], [a])')).toEqual(["3:table_mismatch", "1:dangling_ref"]);
  });

  it("a Table holds only TableRows, and a TableRow sits only in a Table", () => {
    expect(issues('root = Table(["Plan"], [x])', 'x = Text("not a row")')).toEqual(["2:table_mismatch", "1:dangling_ref"]);
    expect(issues("root = Stack([r])", 'r = TableRow(["Basic"])')).toEqual(["2:table_mismatch", "1:dangling_ref"]);
  });
});

describe("Tabs and Tab", () => {
  it("accepts tabs holding tabs, and a tab holding any components", () => {
    expect(issues("root = Tabs([a, b])", 'a = Tab("Profile", [t])', 't = Text("Hello")', 'b = Tab("Alerts", [])')).toEqual([]);
  });

  it.each([
    ["a tab without a label", call("a", "Tab", [], { children: arr() })],
    ["a tab with an empty label", call("a", "Tab", [str(""), arr()])],
  ])("rejects %s", (_, raw) => {
    expect(codes(raw)).toContain("invalid_props");
  });

  it("Tabs hold only Tab, and a Tab sits only in Tabs (tabs_mismatch)", () => {
    expect(issues("root = Tabs([x])", 'x = Text("not a tab")')).toEqual(["2:tabs_mismatch", "1:dangling_ref"]);
    expect(issues("root = Stack([a])", 'a = Tab("Profile", [])')).toEqual(["2:tabs_mismatch", "1:dangling_ref"]);
  });
});

describe("Notice", () => {
  it.each(["info", "success", "warning", "danger"])("accepts tone %s", (tone) => {
    expect(codes(call("n", "Notice", [str("Payments are paused.")], { tone: str(tone), title: str("Heads up") }))).toEqual([]);
  });

  it("defaults: text alone is enough", () => {
    expect(codes(call("n", "Notice", [str("Saved.")]))).toEqual([]);
  });

  it.each([
    ["an unknown tone", call("n", "Notice", [str("x")], { tone: str("error") })],
    ["no text", call("n", "Notice", [], { tone: str("info") })],
  ])("rejects %s", (_, raw) => {
    expect(codes(raw)).toContain("invalid_props");
  });
});

describe("new components never call the backend", () => {
  it("an McpMutation can only target a Button with an action", () => {
    expect(
      issues("root = Stack([w])", "$news = false", 'w = Switch($news, label="News")', 'm = McpMutation(w, tool="profile.update", params={})'),
    ).toContain("4:mutation_target_not_interactive");
  });
});
