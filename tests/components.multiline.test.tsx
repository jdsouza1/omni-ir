// @vitest-environment jsdom
// Step 8: Input's `lines` prop, a multi-line text box (PLAN-MULTILINE.md).
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { validateStatement, type IssueCode } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { call, num, st, str } from "./helpers";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const ctx = { tools: TOOLS, assets: Object.keys(ASSETS) };
const codes = (raw: Parameters<typeof validateStatement>[0]): IssueCode[] => {
  const r = validateStatement(raw, ctx);
  return r.ok ? [] : r.issues.map((i) => i.code);
};
const input = (lines: ReturnType<typeof num> | ReturnType<typeof str>) => call("m", "Input", [st("$m")], { label: str("Message"), lines });

describe("Input lines: schema", () => {
  it.each([1, 4, 10])("accepts lines=%s", (n) => {
    expect(codes(input(num(n)))).toEqual([]);
  });

  it.each([
    ["0", num(0)],
    ["11", num(11)],
    ["1.5", num(1.5)],
    ['"4"', str("4")],
  ])("rejects lines=%s", (_, value) => {
    expect(codes(input(value))).toContain("invalid_props");
  });
});

describe("Input lines: rendering", () => {
  it("draws a box showing that many lines, which edits its text state", async () => {
    const h = renderOmni({ lines: ["root = Stack([m, echo])", '$m = ""', 'm = Input($m, label="What happened?", lines=4)', "echo = Text($m)"] });
    const box = screen.getByLabelText("What happened?");
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.getAttribute("rows")).toBe("4");
    await userEvent.type(box, "The lid{enter}is cracked");
    // Every component using $m shows the new text, line break included.
    expect(h.container.querySelector('[data-node-id="echo"]')?.textContent).toBe("The lid\nis cracked");
  });

  it("stays a single-line field without lines, or with lines=1", () => {
    renderOmni({ lines: ["root = Stack([a, b])", '$a = ""', '$b = ""', 'a = Input($a, label="A")', 'b = Input($b, label="B", lines=1)'] });
    expect(screen.getByLabelText("A").tagName).toBe("INPUT");
    expect(screen.getByLabelText("B").tagName).toBe("INPUT");
  });
});
