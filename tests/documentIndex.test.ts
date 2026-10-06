// The incremental document checks (PLAN-HARDENING.md, C.2) must report exactly what the whole-document
// check reports. For every line of thousands of fuzz streams and every fixture, the issues from
// DocumentIndex.check(statement) are compared with validateDocument([...accepted, statement]).
import fc from "fast-check";
import { DocumentIndex, parseLine, validateDocument, validateStatement, type Statement } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { fixtureTexts, mutatedFixture, stream } from "../fuzz/arbitraries";

const ctx = { tools: TOOLS, assets: Object.keys(ASSETS) };
const key = (issues: { code: string; id?: string | undefined }[]) => [...new Set(issues.map((i) => `${i.code}:${i.id ?? ""}`))].sort();

/** Walk a stream line by line, comparing the two checks on every statement that passes the line rules. */
function compare(text: string) {
  const index = new DocumentIndex();
  const accepted: Statement[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const parsed = parseLine(line);
    if (parsed.kind !== "statement") continue;
    const result = validateStatement(parsed.statement, ctx);
    if (!result.ok) continue;
    const whole = validateDocument([...accepted, result.statement], { complete: false });
    const incremental = index.check(result.statement);
    expect(key(incremental), line).toEqual(key(whole));
    if (whole.length === 0) {
      accepted.push(result.statement);
      index.add(result.statement);
    }
  }
}

describe("DocumentIndex agrees with validateDocument", () => {
  it("on every fixture", () => {
    for (const text of fixtureTexts()) compare(text);
  });

  it("on hand-made conflicts: duplicates, cycles, parents, containers, charts, tables, state types, mutations", () => {
    compare(
      [
        "root = Stack([a, b, list, chart, tbl, f, pay, m0])",
        "a = Stack([b, a])", // self cycle
        "b = Stack([c])",
        "c = Stack([b])", // cycle b -> c -> b
        "d = Stack([c])", // c already has a parent
        "e = Stack([x, x])", // duplicate child
        "g = Stack([root])", // root as child
        "list = List([li, txt])",
        'li = ListItem("One")',
        'txt = Text("not an item")',
        'stray = Stack([li2])',
        'li2 = ListItem("Two")',
        'chart = BarChart("Sales", ["Jan", "Feb"], [s1, s2])',
        's1 = Series("A", [1, 2])',
        's2 = Series("B", [1, 2, 3])',
        'tbl = Table(["A", "B"], [r1])',
        'r1 = TableRow(["x"])',
        '$name = 3',
        'f = Input($name, label="Name")',
        '$on = "yes"',
        'sw = Switch($on, label="On")',
        'pay = Button("Pay", action="pay")',
        'pm = McpMutation(pay, tool="payments.confirm", params={amount: 1, note: ""})',
        'pm2 = McpMutation(pay, tool="payments.confirm", params={amount: 1, note: ""})',
        'm0 = McpMutation(pay, tool="payments.confirm")', // listed as a child of root
        'a = Text("again")', // duplicate id
        '$name = "again"', // duplicate state
      ].join("\n"),
    );
  });

  it("on thousands of generated and edited streams", () => {
    fc.assert(
      fc.property(fc.oneof(stream, mutatedFixture(fixtureTexts())), (text) => compare(text)),
      { numRuns: Number(process.env.FUZZ_RUNS ?? 2000), seed: Number(process.env.FUZZ_SEED ?? 20261005) },
    );
  }, 300_000);
});
