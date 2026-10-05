// Step 11: BarChart, LineChart, PieChart, Series and Slice (PLAN-CHARTS.md). Protocol rules only;
// rendering is covered in components.charts.test.tsx.
import { createParser, validateStatement } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { arr, call, num, ref, st, str } from "./helpers";

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
  // Distinct, as the conformance suite compares them: one line may break two rules with the same code.
  return [...new Set(out)];
}

const labels = (n: number) => arr(...Array.from({ length: n }, (_, i) => str(`L${i + 1}`)));
const numbers = (n: number) => arr(...Array.from({ length: n }, (_, i) => num(i)));
const refs = (n: number) => arr(...Array.from({ length: n }, (_, i) => ref(`s${i}`)));

describe.each(["BarChart", "LineChart"])("%s", (type) => {
  it("accepts a title, labels, series and a format", () => {
    expect(codes(call("c", type, [str("Sales by month"), labels(3), refs(2)], { format: str("currency"), currency: str("EUR") }))).toEqual([]);
    expect(codes(call("c", type, [str("Visitors"), labels(24), refs(6)], { format: str("percent") }))).toEqual([]);
  });

  it.each([
    ["no title", [], { labels: labels(3), children: refs(1) }],
    ["an empty title", [str(""), labels(3), refs(1)], {}],
    ["no labels", [str("T"), arr(), refs(1)], {}],
    ["25 labels", [str("T"), labels(25), refs(1)], {}],
    ["a number label", [str("T"), arr(num(1)), refs(1)], {}],
    ["7 series", [str("T"), labels(3), refs(7)], {}],
    ["an unknown format", [str("T"), labels(3), refs(1)], { format: str("money") }],
    ["a lowercase currency", [str("T"), labels(3), refs(1)], { currency: str("eur") }],
  ])("rejects %s", (_, args, named) => {
    expect(codes(call("c", type, args, named))).toContain("invalid_props");
  });

  // Data, not pixels: the renderer owns colours, styles, animation and tooltips.
  it.each(["color", "colors", "style", "className", "animation", "tooltip", "palette"])("rejects a %s prop", (prop) => {
    expect(codes(call("c", type, [str("T"), labels(3), refs(1)], { [prop]: str("red") }))).toContain("invalid_props");
  });
});

describe("PieChart", () => {
  it("accepts a title and up to 8 slices", () => {
    expect(codes(call("p", "PieChart", [str("Where orders come from"), refs(8)], { format: str("percent") }))).toEqual([]);
  });

  it.each([
    ["no title", call("p", "PieChart", [], { children: refs(2) })],
    ["9 slices", call("p", "PieChart", [str("T"), refs(9)])],
    ["a color prop", call("p", "PieChart", [str("T"), refs(2)], { color: str("red") })],
    ["a tooltip prop", call("p", "PieChart", [str("T"), refs(2)], { tooltip: str("Share") })],
  ])("rejects %s", (_, raw) => {
    expect(codes(raw)).toContain("invalid_props");
  });
});

describe("Series and Slice", () => {
  it("accept a name with numbers", () => {
    expect(codes(call("s", "Series", [str("Online"), numbers(24)]))).toEqual([]);
    expect(codes(call("s", "Series", [str("Change"), arr(num(-4.5), num(0), num(12.25))]))).toEqual([]);
    expect(codes(call("w", "Slice", [str("Website"), num(62)]))).toEqual([]);
    expect(codes(call("w", "Slice", [str("Nothing yet"), num(0)]))).toEqual([]);
  });

  it.each([
    ["a Series with no values", call("s", "Series", [str("A"), arr()])],
    ["a Series with 25 values", call("s", "Series", [str("A"), numbers(25)])],
    ["a Series with a text value", call("s", "Series", [str("A"), arr(num(1), str("2"))])],
    ["a Series with $state values", call("s", "Series", [str("A"), st("$values")])],
    ["a Series without a name", call("s", "Series", [], { values: numbers(3) })],
    ["a Series with a color", call("s", "Series", [str("A"), numbers(3)], { color: str("#ff0000") })],
    ["a Slice with a negative value", call("w", "Slice", [str("A"), num(-1)])],
    ["a Slice with a text value", call("w", "Slice", [str("A"), str("62")])],
    ["a Slice with a color", call("w", "Slice", [str("A"), num(1)], { color: str("blue") })],
  ])("reject %s", (_, raw) => {
    expect(codes(raw)).toContain("invalid_props");
  });
});

describe("chart document rules", () => {
  it("streams a chart series by series", () => {
    expect(
      issues(
        'root = BarChart("Sales", ["Jul", "Aug", "Sep"], [online, store], format="currency")',
        'online = Series("Online", [1200, 1500, 1800])',
        'store = Series("In store", [900, 1100, 950])',
      ),
    ).toEqual([]);
    expect(issues('root = PieChart("Channels", [web, app])', 'web = Slice("Website", 62)', 'app = Slice("App", 38)')).toEqual([]);
  });

  it("a Series has one value per label of its chart (chart_mismatch), whichever line arrives first", () => {
    expect(issues('root = LineChart("Visitors", ["W1", "W2"], [s])', 's = Series("Users", [1, 2, 3])')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
    expect(issues("root = Stack([c])", 's = Series("Users", [1])', 'c = BarChart("Visitors", ["W1", "W2"], [s])')).toEqual(["3:chart_mismatch", "1:dangling_ref"]);
  });

  it("bar and line charts hold only Series, and a pie chart only Slices", () => {
    expect(issues('root = BarChart("T", ["A"], [x])', 'x = Slice("A", 1)')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
    expect(issues('root = PieChart("T", [x])', 'x = Series("A", [1])')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
    expect(issues('root = LineChart("T", ["A"], [x])', 'x = Text("not a series")')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
  });

  it("a Series sits only in a bar or line chart, and a Slice only in a pie chart", () => {
    expect(issues("root = Stack([s])", 's = Series("A", [1])')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
    expect(issues("root = Stack([w])", 'w = Slice("A", 1)')).toEqual(["2:chart_mismatch", "1:dangling_ref"]);
  });

  it("charts never call the backend: an McpMutation can only target a Button with an action", () => {
    expect(issues('root = PieChart("T", [])', 'm = McpMutation(root, tool="profile.update", params={})')).toContain("2:mutation_target_not_interactive");
  });
});
