import { validateDocument, validateStatement, type Statement } from "../engine/schema";
import type { IssueCode, RawStatement } from "../engine/types";
import { TOOLS, arr, bool, call, nested, nul, num, obj, ref, st, state, str } from "./helpers";

const ctx = { tools: TOOLS };

function validate(raw: RawStatement) {
  return validateStatement(raw, ctx);
}

function statements(...raws: RawStatement[]): Statement[] {
  return raws.map((raw) => {
    const result = validate(raw);
    if (!result.ok) throw new Error(`fixture line failed: ${JSON.stringify(result.issues)}`);
    return result.statement;
  });
}

function codes(issues: { code: IssueCode }[]): IssueCode[] {
  return issues.map((i) => i.code);
}

describe("validateStatement: valid lines", () => {
  it.each<[string, RawStatement]>([
    ["Stack with children and enums", call("s", "Stack", [arr(ref("a"), ref("b"))], { direction: str("row"), gap: str("md") })],
    ["Card with a title", call("c", "Card", [arr(ref("x"))], { title: str("Payment") })],
    ["Heading with level", call("h", "Heading", [str("Confirm payment")], { level: num(2) })],
    ["Text bound to state with currency format", call("t", "Text", [st("$amount")], { format: str("currency"), currency: str("USD") })],
    ["Input bound to state", call("i", "Input", [st("$note")], { label: str("Note"), placeholder: str("Optional") })],
    ["Button with an action", call("b", "Button", [str("Pay now")], { action: str("pay") })],
    ["Divider with no args", call("d", "Divider")],
    ["Badge with tone", call("g", "Badge", [str("Pending")], { tone: str("warning") })],
    ["state declaration", state("$amount", num(42.5))],
    ["McpMutation with params mixing literals and state", call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm"), params: obj({ amount: st("$amount"), note: str("hi") }) })],
  ])("%s", (_, raw) => {
    const result = validate(raw);
    expect(result.ok, JSON.stringify(result)).toBe(true);
  });

  it("maps positional children into the node and strips them from props", () => {
    const result = validate(call("s", "Stack", [arr(ref("a"), ref("b"))], { direction: str("row") }));
    expect(result).toEqual({
      ok: true,
      statement: { kind: "node", id: "s", type: "Stack", props: { direction: "row" }, children: ["a", "b"] },
    });
  });

  it("normalises an McpMutation", () => {
    const result = validate(call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm"), params: obj({ amount: st("$amount") }) }));
    expect(result).toEqual({
      ok: true,
      statement: { kind: "mutation", id: "m", target: "b", tool: "payments.confirm", params: { amount: { kind: "state", key: "$amount" } } },
    });
  });
});

describe("validateStatement: invalid lines", () => {
  it.each<[string, RawStatement, IssueCode]>([
    ["unknown component", call("x", "Marquee", [str("hi")]), "unknown_component"],
    ["renderer-only NodeFallback", call("x", "NodeFallback"), "unknown_component"],
    ["nested component call (not flat)", call("c", "Card", [arr(nested("Heading"))]), "not_flat"],
    ["nested call as a named arg", call("b", "Button", [str("x")], { action: nested("Text") }), "not_flat"],
    ["style prop", call("t", "Text", [str("hi")], { style: str("color:red") }), "invalid_props"],
    ["className prop", call("t", "Text", [str("hi")], { className: str("text-red-500") }), "invalid_props"],
    ["html prop", call("t", "Text", [str("hi")], { html: str("<b>hi</b>") }), "invalid_props"],
    ["__proto__ prop", call("t", "Text", [str("hi")], [["__proto__", str("x")]]), "invalid_props"],
    ["__proto__ prop holding an object", call("t", "Text", [str("hi")], [["__proto__", obj({ tone: str("strong") })]]), "invalid_props"],
    ["__proto__ key in McpMutation params", call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm"), params: { kind: "object", entries: [["__proto__", num(1)]] } }), "invalid_props"],
    ["constructor as id", call("constructor", "Divider"), "invalid_props"],
    ["enum value outside the list", call("s", "Stack", [arr()], { direction: str("diagonal") }), "invalid_props"],
    ["too many positional args", call("t", "Text", [str("a"), str("b")]), "invalid_props"],
    ["same arg positional and named", call("t", "Text", [str("a")], { text: str("b") }), "invalid_props"],
    ["children that are not references", call("s", "Stack", [arr(str("a"))]), "invalid_props"],
    ["Input bound to a literal instead of state", call("i", "Input", [str("x")], { label: str("L") }), "invalid_props"],
    ["Input with a free-form HTML attribute", call("i", "Input", [st("$n")], { label: str("L"), type: str("password") }), "invalid_props"],
    ["object literal outside McpMutation params", call("t", "Text", [obj({ a: str("b") })]), "invalid_props"],
    ["reserved word as id", call("true", "Divider"), "invalid_props"],
    ["tool not in the registry", call("m", "McpMutation", [ref("b")], { tool: str("system.delete_account") }), "unknown_tool"],
    ["registry key inherited from Object.prototype", call("m", "McpMutation", [ref("b")], { tool: str("constructor.name") }), "unknown_tool"],
    ["badly shaped tool name", call("m", "McpMutation", [ref("b")], { tool: str("delete everything") }), "invalid_props"],
    ["McpMutation param holding a node reference", call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm"), params: obj({ a: ref("x") }) }), "invalid_props"],
    ["duplicate key in params", call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm"), params: { kind: "object", entries: [["a", num(1)], ["a", num(2)]] } }), "invalid_props"],
    ["state holding an array", state("$items", arr(num(1))), "invalid_props"],
    ["state key without $", state("amount", num(1)), "invalid_props"],
  ])("%s", (_, raw, expected) => {
    const result = validate(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.issues)).toContain(expected);
  });

  it("accepts a null state value and a boolean", () => {
    expect(validate(state("$maybe", nul)).ok).toBe(true);
    expect(validate(state("$flag", bool(true))).ok).toBe(true);
  });
});

describe("validateDocument", () => {
  const paymentDoc = () =>
    statements(
      call("root", "Card", [arr(ref("title"), ref("note"), ref("confirm"))]),
      call("title", "Heading", [str("Confirm payment")]),
      state("$amount", num(42.5)),
      state("$note", str("")),
      call("note", "Input", [st("$note")], { label: str("Note") }),
      call("confirm", "Button", [str("Pay")], { action: str("pay") }),
      call("confirmPay", "McpMutation", [ref("confirm")], { tool: str("payments.confirm"), params: obj({ amount: st("$amount"), note: st("$note") }) }),
    );

  it("accepts a complete, governed document", () => {
    expect(validateDocument(paymentDoc(), { complete: true })).toEqual([]);
  });

  it("allows forward references while streaming but not at the end", () => {
    const doc = statements(call("root", "Card", [arr(ref("later"))]));
    expect(validateDocument(doc, { complete: false })).toEqual([]);
    expect(codes(validateDocument(doc, { complete: true }))).toEqual(["dangling_ref"]);
  });

  it.each<[string, RawStatement[], IssueCode, boolean]>([
    ["duplicate id", [call("a", "Divider"), call("a", "Divider")], "duplicate_id", false],
    ["state assigned twice", [state("$x", num(1)), state("$x", num(2))], "duplicate_id", false],
    ["same child twice in one list", [call("root", "Stack", [arr(ref("a"), ref("a"))])], "duplicate_child", false],
    ["node with two parents", [call("root", "Stack", [arr(ref("a"), ref("b"))]), call("a", "Stack", [arr(ref("c"))]), call("b", "Stack", [arr(ref("c"))])], "multiple_parents", false],
    ["cycle", [call("a", "Stack", [arr(ref("b"))]), call("b", "Stack", [arr(ref("a"))])], "cycle", false],
    ["root as a child", [call("a", "Stack", [arr(ref("root"))])], "root_as_child", false],
    ["McpMutation used as a child", [call("root", "Stack", [arr(ref("m"))]), call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm") })], "child_not_component", false],
    ["Input bound to a number", [state("$n", num(3)), call("i", "Input", [st("$n")], { label: str("L") })], "input_state_type", false],
    ["two McpMutations for one button", [call("m1", "McpMutation", [ref("b")], { tool: str("payments.confirm") }), call("m2", "McpMutation", [ref("b")], { tool: str("payments.confirm") })], "duplicate_mutation", false],
    ["missing root", [call("a", "Divider")], "missing_root", true],
    ["unwrapped mutating Button", [call("root", "Stack", [arr(ref("b"))]), call("b", "Button", [str("Pay")], { action: str("pay") })], "ungoverned_mutation", true],
    ["McpMutation targeting a Button without action", [call("root", "Stack", [arr(ref("b"))]), call("b", "Button", [str("Cancel")]), call("m", "McpMutation", [ref("b")], { tool: str("payments.confirm") })], "mutation_target_not_interactive", true],
    ["state used but never declared", [call("root", "Text", [st("$ghost")])], "missing_state", true],
  ])("%s", (_, raws, expected, completeOnly) => {
    const doc = statements(...raws);
    expect(codes(validateDocument(doc, { complete: true }))).toContain(expected);
    if (completeOnly) expect(codes(validateDocument(doc, { complete: false }))).not.toContain(expected);
    else expect(codes(validateDocument(doc, { complete: false }))).toContain(expected);
  });
});
