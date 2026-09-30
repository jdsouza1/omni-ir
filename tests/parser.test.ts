import { createParser, parseStream, type OmniParser, type ParserEvent } from "../engine/parser";
import type { OmniDocument } from "../engine/store";
import type { IssueCode } from "../engine/types";
import { TOOLS } from "../app/tools";

function setup() {
  const parser = createParser({ tools: TOOLS });
  const events: ParserEvent[] = [];
  parser.subscribe((e) => events.push(e));
  const errors = () => events.flatMap((e) => (e.type === "error" ? [e.issue.code] : []));
  const warnings = () => events.flatMap((e) => (e.type === "warning" ? [e.issue.code] : []));
  return { parser, events, errors, warnings };
}

function feed(parser: OmniParser, lines: string[]) {
  parser.write(lines.join("\n") + "\n");
}

/** A plain, comparable view of a document snapshot. */
function plain(doc: OmniDocument) {
  return {
    nodes: Object.fromEntries(doc.nodes),
    mutations: Object.fromEntries(doc.mutations),
    state: { ...doc.state },
    pending: [...doc.pending].sort(),
    missing: [...doc.missing].sort(),
    complete: doc.complete,
  };
}

const PAYMENT = [
  "root = Card([title, amount, note, actions])",
  'title = Heading("Confirm payment")',
  "$amount = 42.50",
  '$note = ""',
  'amount = Text($amount, format="currency", currency="USD")',
  'note = Input($note, label="Note for merchant, optional (max 500)")',
  'actions = Stack([confirm, cancel], direction="row")',
  'confirm = Button("Pay now", action="pay")',
  'confirmPay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})',
  'cancel = Button("Cancel", variant="secondary")',
];

describe("createParser: single lines", () => {
  it("adds a valid node to the snapshot and emits a node event with its line number", () => {
    const { parser, events } = setup();
    parser.write('title = Heading("Hello")\n');
    expect(parser.getSnapshot().nodes.get("title")).toEqual({
      kind: "node",
      id: "title",
      type: "Heading",
      props: { text: "Hello" },
      children: [],
    });
    expect(events).toContainEqual({ type: "node", id: "title", line: 1 });
  });

  it("stores state lines and McpMutations", () => {
    const { parser, errors } = setup();
    feed(parser, ["$amount = 42.50", 'confirm = Button("Pay", action="pay")', 'm = McpMutation(confirm, tool="payments.confirm", params={amount: $amount})']);
    const doc = parser.getSnapshot();
    expect(doc.state).toEqual({ $amount: 42.5 });
    expect(doc.mutations.get("confirm")).toMatchObject({ id: "m", tool: "payments.confirm" });
    expect(errors()).toEqual([]);
  });

  it("ignores blank lines and comments", () => {
    const { parser, events } = setup();
    feed(parser, ["", "# heading comment", "   ", "d = Divider()  # trailing"]);
    expect(events).toEqual([{ type: "node", id: "d", line: 4 }]);
  });
});

describe("createParser: forward references (R5)", () => {
  it("marks a child as pending, then resolves it when its line arrives", () => {
    const { parser, events } = setup();
    parser.write("root = Card([title])\n");
    expect(parser.getSnapshot().pending.has("title")).toBe(true);
    expect(events).toContainEqual({ type: "pending", id: "title", line: 1 });

    parser.write('title = Heading("Hi")\n');
    expect(parser.getSnapshot().pending.has("title")).toBe(false);
    expect(events).toContainEqual({ type: "resolved", id: "title", line: 2 });
  });

  it("marks an Input's state as pending until the $state line arrives", () => {
    const { parser, events } = setup();
    parser.write('note = Input($note, label="Note")\n');
    expect(parser.getSnapshot().pending.has("$note")).toBe(true);
    parser.write('$note = ""\n');
    expect(parser.getSnapshot().pending.has("$note")).toBe(false);
    expect(events).toContainEqual({ type: "resolved", id: "$note", line: 2 });
  });

  it("does not mark an already-arrived child as pending", () => {
    const { parser, events } = setup();
    feed(parser, ['title = Heading("Hi")', "root = Card([title])"]);
    expect(events.some((e) => e.type === "pending")).toBe(false);
  });
});

describe("createParser: errors never stop the stream", () => {
  it.each<[string, string, IssueCode]>([
    ["nested component call", 'root = Card([Heading("Pay")])', "not_flat"],
    ["malformed line", "root = Card([a, b", "syntax"],
    ["unterminated string", 't = Text("oops)', "unterminated_string"],
    ["schema-invalid prop", 't = Text("x", style="color:red")', "invalid_props"],
    ["unknown component", 'x = Iframe("https://evil.example")', "unknown_component"],
    ["tool not in registry (R6)", 'm = McpMutation(b, tool="system.delete_account")', "unknown_tool"],
  ])("%s → %s, and the next line still parses", (_, badLine, code) => {
    const { parser, errors } = setup();
    feed(parser, [badLine, "ok = Divider()"]);
    expect(errors()).toEqual([code]);
    expect(parser.getSnapshot().nodes.has("ok")).toBe(true);
  });

  it("attaches the stream line number to errors", () => {
    const { parser, events } = setup();
    feed(parser, ["a = Divider()", "b = Nope()"]);
    const error = events.find((e) => e.type === "error");
    expect(error).toMatchObject({ type: "error", issue: { code: "unknown_component", line: 2 } });
  });

  it("rejects a redefinition and keeps the first definition", () => {
    const { parser, errors } = setup();
    feed(parser, ['t = Text("first")', 't = Text("second")']);
    expect(errors()).toEqual(["duplicate_id"]);
    expect(parser.getSnapshot().nodes.get("t")?.props).toEqual({ text: "first" });
  });

  it("rejects a line that would create a cycle", () => {
    const { parser, errors } = setup();
    feed(parser, ["a = Stack([b])", "b = Stack([a])"]);
    expect(errors()).toEqual(["cycle"]);
    expect(parser.getSnapshot().nodes.has("b")).toBe(false);
  });

  it("rejects a second parent for the same child", () => {
    const { parser, errors } = setup();
    feed(parser, ["a = Stack([c])", "b = Stack([c])"]);
    expect(errors()).toEqual(["multiple_parents"]);
  });

  it("keeps an unknown escape as a warning, not an error, and still adds the node (R4)", () => {
    const { parser, errors, warnings } = setup();
    parser.write('t = Text("Path: C:\\data")\n');
    expect(errors()).toEqual([]);
    expect(warnings()).toEqual(["unknown_escape"]);
    expect(parser.getSnapshot().nodes.get("t")?.props).toEqual({ text: "Path: C:\\data" });
  });

  it("reports an over-long line and carries on", () => {
    const parser = createParser({ tools: TOOLS, maxLineLength: 20 });
    const codes: IssueCode[] = [];
    parser.subscribe((e) => e.type === "error" && codes.push(e.issue.code));
    parser.write(`t = Text("${"x".repeat(50)}")\nok = Divider()\n`);
    expect(codes).toEqual(["line_too_long"]);
    expect(parser.getSnapshot().nodes.has("ok")).toBe(true);
  });
});

describe("createParser: end of stream", () => {
  it("flushes a final line without a newline", () => {
    const { parser } = setup();
    parser.write("root = Divider()");
    expect(parser.getSnapshot().nodes.has("root")).toBe(false);
    parser.end();
    expect(parser.getSnapshot().nodes.has("root")).toBe(true);
  });

  it("returns no issues for a complete, governed document and marks it complete", () => {
    const { parser, events } = setup();
    feed(parser, PAYMENT);
    expect(parser.end()).toEqual([]);
    expect(parser.getSnapshot().complete).toBe(true);
    expect(events.at(-1)).toEqual({ type: "end", issues: [] });
  });

  it("moves references that never arrived from pending to missing", () => {
    const { parser } = setup();
    feed(parser, ["root = Card([title, ghost])", 'title = Heading("Hi")', 'note = Input($never, label="x")']);
    const issues = parser.end();
    const doc = parser.getSnapshot();
    expect([...doc.missing].sort()).toEqual(["$never", "ghost"]);
    expect(doc.pending.size).toBe(0);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["dangling_ref", "missing_state"]));
  });

  it("reports an ungoverned mutating Button", () => {
    const { parser } = setup();
    feed(parser, ["root = Stack([b])", 'b = Button("Pay", action="pay")']);
    expect(parser.end().map((i) => i.code)).toEqual(["ungoverned_mutation"]);
  });

  it("emits each end-of-stream issue as an error event, then an end event", () => {
    const { parser, events } = setup();
    parser.write("a = Divider()\n");
    parser.end();
    const tail = events.slice(-2);
    expect(tail[0]).toMatchObject({ type: "error", issue: { code: "missing_root" } });
    expect(tail[1]).toMatchObject({ type: "end", issues: [{ code: "missing_root" }] });
  });

  it("throws if written to after end()", () => {
    const { parser } = setup();
    parser.end();
    expect(() => parser.write("a = Divider()\n")).toThrow(/after end/);
  });
});

describe("createParser: chunking and structural sharing", () => {
  const source = PAYMENT.join("\r\n") + "\r\n";

  function parseInChunks(size: number) {
    const parser = createParser({ tools: TOOLS });
    const bytes = new TextEncoder().encode(source);
    for (let i = 0; i < bytes.length; i += size) parser.write(bytes.subarray(i, i + size));
    parser.end();
    return plain(parser.getSnapshot());
  }

  it("produces the same document for 1-byte, 7-byte and whole-file chunks", () => {
    const whole = parseInChunks(Number.MAX_SAFE_INTEGER);
    expect(whole.nodes).toHaveProperty("confirm");
    expect(parseInChunks(1)).toEqual(whole);
    expect(parseInChunks(7)).toEqual(whole);
  });

  it("keeps every existing node object identical (===) when an unrelated line arrives", () => {
    const { parser } = setup();
    feed(parser, PAYMENT.slice(0, 6));
    const before = parser.getSnapshot();
    parser.write(`${PAYMENT[6]}\n`);
    const after = parser.getSnapshot();
    expect(after).not.toBe(before);
    for (const [id, node] of before.nodes) expect(after.nodes.get(id)).toBe(node);
  });

  it("parseStream consumes an async iterable and returns the end issues", async () => {
    async function* chunks() {
      yield "root = Card([t])\n";
      yield 't = Text("hi")';
    }
    const { parser, issues } = await parseStream(chunks(), { tools: TOOLS });
    expect(issues).toEqual([]);
    expect(parser.getSnapshot().nodes.has("t")).toBe(true);
  });
});

describe("store.setState (R1)", () => {
  it("updates a declared state key and notifies subscribers without touching node objects", () => {
    const { parser } = setup();
    feed(parser, ['$note = ""', 'note = Input($note, label="Note")']);
    const before = parser.getSnapshot();
    let notified = 0;
    parser.store.subscribe(() => notified++);
    parser.store.setState("$note", "hello");
    const after = parser.getSnapshot();
    expect(after.state.$note).toBe("hello");
    expect(after.nodes.get("note")).toBe(before.nodes.get("note"));
    expect(notified).toBe(1);
  });

  it("refuses to create undeclared state", () => {
    const { parser } = setup();
    expect(() => parser.store.setState("$ghost", "x")).toThrow(/not declared/);
  });
});
