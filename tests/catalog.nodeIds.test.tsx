// @vitest-environment jsdom
// Playground Task B: every catalog component marks its root element with data-node-id, so the
// playground can highlight what a line builds.
import { cleanup } from "@testing-library/react";
import { COMPONENT_TYPES } from "@omni-ir/core";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const LINES = [
  "root = Stack([card, badge, divider, skel, actions, media, more])",
  "more = Stack([pick, toggle, plans, tabs, notice])",
  '$size = ""',
  'pick = Select($size, label="Size", options=["S", "M"])',
  "$on = false",
  'toggle = Switch($on, label="News")',
  'plans = Table(["Plan", "Price"], [basic])',
  'basic = TableRow(["Basic", 12])',
  "tabs = Tabs([tabA, tabB])",
  'tabA = Tab("A", [inA])',
  'inA = Text("In A")',
  'tabB = Tab("B", [])',
  'notice = Notice("Saved.", tone="success")',
  "media = Stack([photo, stars, when, items, msg])",
  'photo = Image("cabin-pines", alt="A cabin")',
  "stars = Rating(4.5)",
  '$when = ""',
  'when = DateInput($when, label="When")',
  "items = List([item])",
  'item = ListItem("Linen overshirt", detail="Sand", trailing="$128.00", image="shirt")',
  'msg = Message("Hello", from="user")',
  'card = Card([h, t, i], title="Card title")',
  'h = Heading("Heading")',
  't = Text("Body")',
  '$v = ""',
  'i = Input($v, label="Field")',
  'badge = Badge("New")',
  "divider = Divider()",
  "skel = Skeleton(lines=2)",
  "actions = Stack([pay, cancel], direction=\"row\")",
  'pay = Button("Pay", action="pay")',
  'payM = McpMutation(pay, tool="payments.confirm", params={amount: 1, note: ""})',
  'cancel = Button("Cancel")',
];

describe("data-node-id on catalog components", () => {
  it("covers every component type in the fixture", () => {
    const types = new Set(LINES.flatMap((l) => /= ([A-Z]\w+)\(/.exec(l)?.[1] ?? []));
    for (const type of COMPONENT_TYPES) expect(types, type).toContain(type);
  });

  it("marks exactly one element per node, nested inside its parent's element", () => {
    const h = renderOmni({ lines: LINES });
    const doc = h.parser.getSnapshot();
    for (const [id, node] of doc.nodes) {
      const els = h.container.querySelectorAll(`[data-node-id="${id}"]`);
      expect(els.length, id).toBe(1);
      for (const child of node.children) {
        expect(els[0]!.querySelector(`[data-node-id="${child}"]`), `${child} inside ${id}`).not.toBeNull();
      }
    }
  });

  it("puts the id on the outermost element of the component", () => {
    const h = renderOmni({ lines: LINES });
    for (const el of h.container.querySelectorAll("[data-node-id]")) {
      const id = el.getAttribute("data-node-id")!;
      // The element's parent belongs to a different node (or the renderer root).
      const parentMarked = el.parentElement?.closest("[data-node-id]");
      expect(parentMarked?.getAttribute("data-node-id") ?? "none", id).not.toBe(id);
    }
    const button = h.container.querySelector('[data-node-id="pay"]')!;
    expect(button.classList.contains("omni-button-wrap")).toBe(true);
    expect(button.querySelector("button")?.getAttribute("data-mcp-tool")).toBe("payments.confirm");
  });
});
