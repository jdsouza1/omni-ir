// Step 19 (PLAN-FORMS.md, A.1–A.2): the field checks every renderer shares, against the
// language-neutral cases in conformance/fields (SPEC.md section 8, Fields).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkField, createParser, FIELD_MESSAGES, fieldsReadBy } from "@omni-ir/core";
import { ENGLISH } from "@omni-ir/react";
import { FIELD_CASES, renderFieldFiles } from "../conformance/fields";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";

describe("field checks (conformance/fields)", () => {
  it("the JSON file is up to date (npm run conformance:build)", () => {
    expect(readFileSync("conformance/fields/fields.json", "utf8")).toBe(renderFieldFiles()["fields.json"]);
  });

  it.each(FIELD_CASES.map((c) => [c.id, c] as const))("%s", (_, c) => {
    expect(checkField(c.component, c.props, c.value)).toEqual(c.expect);
  });

  it("covers every Fields rule in SPEC.md section 8, and cites only rules that exist", () => {
    const spec = readFileSync("SPEC.md", "utf8");
    const section = spec.slice(spec.indexOf("## 8. Renderer requirements"), spec.indexOf("## 9. Actions"));
    const rules = new Set([...section.matchAll(/\*\*\[(8\.\d+)\]\*\*/g)].map((m) => m[1]!));
    const tests = readFileSync("tests/renderer.forms.test.tsx", "utf8") + readFileSync("tests/renderer.app.test.tsx", "utf8") + readFileSync("tests/live.renderer.test.tsx", "utf8");
    const covered = new Set([...FIELD_CASES.flatMap((c) => c.rules), ...[...tests.matchAll(/\[(8\.\d+)\]/g)].map((m) => m[1]!)]);
    expect([...rules].filter((r) => !covered.has(r)), "rules without a case or test").toEqual([]);
    expect([...covered].filter((r) => !rules.has(r)), "cited rules that don't exist").toEqual([]);
  });

  it("every message has words in the renderer's own English", () => {
    for (const key of FIELD_MESSAGES) expect(ENGLISH, key).toHaveProperty(key);
    expect(ENGLISH).toHaveProperty("confirm");
  });
});

describe("which fields a governed button reads [8.6]", () => {
  it("the fields whose $key its McpMutation's params read, in document order", () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    parser.write(
      [
        "root = Card([email, name, search, note, send])",
        '$email = ""',
        'email = Input($email, label="Email", required=true, format="email")',
        '$name = ""',
        'name = Input($name, label="Name")',
        '$q = ""',
        'search = Input($q, label="Search", required=true)',
        '$msg = ""',
        'note = Input($msg, label="Message", required=true, lines=4)',
        'send = Button("Send", action="go")',
        'go = McpMutation(send, tool="support.createTicket", params={subject: $email, message: $msg})',
        "",
      ].join("\n"),
    );
    parser.end();
    const doc = parser.getSnapshot();
    expect(fieldsReadBy(doc.mutations.get("send")!, doc)).toEqual(["email", "note"]);
  });

  it("a key read by two fields brings both; a literal param brings none", () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    parser.write(
      [
        "root = Card([a, b, pay])",
        '$v = ""',
        'a = Input($v, label="A")',
        'b = Input($v, label="B")',
        'pay = Button("Pay", action="go")',
        'go = McpMutation(pay, tool="payments.confirm", params={amount: 5, note: $v})',
        "",
      ].join("\n"),
    );
    const doc = parser.getSnapshot();
    expect(fieldsReadBy(doc.mutations.get("pay")!, doc)).toEqual(["a", "b"]);
  });
});
