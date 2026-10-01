import { parseLine, type LineResult } from "@omni-ir/core";
import type { RawStatement } from "@omni-ir/core";
import { arr, bool, call, nested, nul, num, obj, ref, st, state, str } from "./helpers";

function statementOf(result: LineResult): RawStatement {
  if (result.kind !== "statement") throw new Error(`expected a statement, got ${JSON.stringify(result)}`);
  return result.statement;
}

/** The single string argument of a one-arg call, e.g. Text("…"). */
function firstString(text: string): string {
  const s = statementOf(parseLine(text));
  const arg = s.kind === "call" ? s.args[0] : undefined;
  if (arg?.kind !== "string") throw new Error(`first arg is not a string: ${JSON.stringify(s)}`);
  return arg.value;
}

describe("parseLine: statements", () => {
  it("parses a component call with positional and named args", () => {
    expect(statementOf(parseLine('confirm = Button("Pay now", action="pay", variant="primary")'))).toEqual(
      call("confirm", "Button", [str("Pay now")], { action: str("pay"), variant: str("primary") }),
    );
  });

  it("parses children arrays of references", () => {
    expect(statementOf(parseLine("root = Card([title, amount, actions])"))).toEqual(
      call("root", "Card", [arr(ref("title"), ref("amount"), ref("actions"))]),
    );
  });

  it("parses a state declaration", () => {
    expect(statementOf(parseLine("$amount = 42.50"))).toEqual(state("$amount", num(42.5)));
    expect(statementOf(parseLine('$note = ""'))).toEqual(state("$note", str("")));
  });

  it("parses numbers, booleans, null, state refs and objects", () => {
    expect(statementOf(parseLine('m = McpMutation(b, tool="x.y", params={amount: $amount, n: -1.5e2, ok: true, z: null, "quoted key": "v"})'))).toEqual(
      call("m", "McpMutation", [ref("b")], {
        tool: str("x.y"),
        params: obj({ amount: st("$amount"), n: num(-150), ok: bool(true), z: nul, "quoted key": str("v") }),
      }),
    );
  });

  it("allows a trailing comma and flexible whitespace", () => {
    expect(statementOf(parseLine("  s =Stack( [ a , b , ] , gap = \"sm\" , )  "))).toEqual(
      call("s", "Stack", [arr(ref("a"), ref("b"))], { gap: str("sm") }),
    );
  });

  it("parses an empty call", () => {
    expect(statementOf(parseLine("d = Divider()"))).toEqual(call("d", "Divider"));
  });

  it("represents a nested call as a call value, leaving flatness to the schema", () => {
    expect(statementOf(parseLine('root = Card([Heading("Pay"), b])'))).toEqual(
      call("root", "Card", [arr(nested("Heading"), ref("b"))]),
    );
  });

  it("returns empty for blank lines and comment-only lines", () => {
    expect(parseLine("")).toEqual({ kind: "empty" });
    expect(parseLine("   \t ")).toEqual({ kind: "empty" });
    expect(parseLine("# a comment")).toEqual({ kind: "empty" });
    expect(parseLine("   # indented comment")).toEqual({ kind: "empty" });
  });
});

describe("parseLine: text inside strings (R4)", () => {
  it.each([
    ['t = Text("Hello, world (again)")', "Hello, world (again)"],
    ['t = Text("a = b")', "a = b"],
    ['t = Text("She said \\"hi\\"")', 'She said "hi"'],
    ['t = Text("# not a comment")', "# not a comment"],
    ['t = Text("$5.00")', "$5.00"],
    ['t = Text("[brackets] {braces}")', "[brackets] {braces}"],
    ['t = Text("back\\\\slash")', "back\\slash"],
    ['t = Text("two\\nlines")', "two\nlines"],
  ])("%s", (line, expected) => {
    expect(firstString(line)).toBe(expected);
  });

  it("ignores a trailing comment but keeps # inside the string", () => {
    expect(firstString('t = Text("a # b")   # the real comment')).toBe("a # b");
  });

  it("keeps an unknown escape as literal text with one warning", () => {
    const result = parseLine('t = Text("Path: C:\\data")');
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.statement).toEqual(call("t", "Text", [str("Path: C:\\data")]));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ code: "unknown_escape" });
  });

  it("documents the known limit: C:\\new decodes \\n as a line break, with no warning", () => {
    const result = parseLine('t = Text("C:\\new")');
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.statement).toEqual(call("t", "Text", [str("C:\new")]));
    expect(result.warnings).toEqual([]);
  });
});

describe("parseLine: errors", () => {
  it.each([
    ['t = Text("unterminated)', "unterminated_string"],
    ['t = Text("ends with escaped quote\\")', "unterminated_string"],
    ["root = Card([a, b]", "syntax"],
    ["root = Card([a, b)", "syntax"],
    ["root Card([a])", "syntax"],
    ["= Card([a])", "syntax"],
    ["x = 5", "syntax"],
    ["$x = ", "syntax"],
    ["t = Text('single quotes')", "syntax"],
    ['t = Text("a") extra', "syntax"],
    ['t = Text(label="a", "positional after named")', "syntax"],
    ["t = <div>hi</div>", "syntax"],
    ["1abc = Divider()", "syntax"],
  ])("%s", (line, code) => {
    const result = parseLine(line);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.issues[0]).toMatchObject({ code });
  });
});
