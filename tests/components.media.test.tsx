// @vitest-environment jsdom
// Step 4: Image, Rating, DateInput, List/ListItem and Message.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser } from "@omni-ir/core";
import { validateStatement } from "@omni-ir/core";
import type { IssueCode } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import { call, num, st, str } from "./helpers";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const ctx = { tools: TOOLS, assets: Object.keys(ASSETS) };
const codes = (raw: Parameters<typeof validateStatement>[0], c = ctx) => {
  const r = validateStatement(raw, c);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

function parse(lines: string[], assets: Record<string, unknown> = ASSETS) {
  const parser = createParser({ tools: TOOLS, assets });
  const issues: { line: number | undefined; code: IssueCode }[] = [];
  parser.subscribe((e) => (e.type === "error" || e.type === "warning") && issues.push({ line: e.issue.line, code: e.issue.code }));
  parser.write(lines.join("\n") + "\n");
  parser.end();
  return issues;
}

describe("schema: new components", () => {
  it.each([
    ["Image from the registry", call("p", "Image", [str("cabin-pines")], { alt: str("A cabin"), ratio: str("16:9") })],
    ["Rating with a number", call("r", "Rating", [num(4.96)])],
    ["Rating with state and max", call("r", "Rating", [st("$score")], { max: num(10) })],
    ["DateInput with limits", call("d", "DateInput", [st("$checkIn")], { label: str("Check-in"), min: str("2026-10-01"), max: str("2027-10-01") })],
    ["ListItem with image", call("i", "ListItem", [str("Tote")], { detail: str("Natural"), trailing: str("$86.00"), image: str("tote") })],
    ["Message from the user", call("m", "Message", [str("Hi")], { from: str("user") })],
  ])("accepts %s", (_, raw) => {
    expect(codes(raw)).toEqual([]);
  });

  it.each<[string, Parameters<typeof validateStatement>[0], IssueCode]>([
    ["an image URL instead of an asset name", call("p", "Image", [str("https://evil.example/pixel.gif")], { alt: str("x") }), "invalid_props"],
    ["a data URI instead of an asset name", call("p", "Image", [str("data:image/svg+xml,<svg/>")], { alt: str("x") }), "invalid_props"],
    ["an unregistered asset", call("p", "Image", [str("not-registered")], { alt: str("x") }), "unknown_asset"],
    ["an Image without alt text", call("p", "Image", [str("cabin-pines")]), "invalid_props"],
    ["a ListItem with an unregistered image", call("i", "ListItem", [str("x")], { image: str("nope") }), "unknown_asset"],
    ["a Rating above max", call("r", "Rating", [num(6)]), "invalid_props"],
    ["a negative Rating", call("r", "Rating", [num(-1)]), "invalid_props"],
    ["a DateInput bound to a literal", call("d", "DateInput", [str("2026-10-14")], { label: str("x") }), "invalid_props"],
    ["a DateInput min in the wrong format", call("d", "DateInput", [st("$d")], { label: str("x"), min: str("14/10/2026") }), "invalid_props"],
    ["a Message without from", call("m", "Message", [str("Hi")]), "invalid_props"],
    ["a Message from the system", call("m", "Message", [str("Hi")], { from: str("system") }), "invalid_props"],
  ])("rejects %s", (_, raw, code) => {
    expect(codes(raw)).toContain(code);
  });

  it("accepts no images at all when the parser has no asset registry", () => {
    expect(codes(call("p", "Image", [str("cabin-pines")], { alt: str("x") }), { tools: TOOLS, assets: [] })).toEqual(["unknown_asset"]);
  });
});

describe("document rules: lists and dates", () => {
  it("a List may only contain ListItems, whichever line arrives first", () => {
    expect(parse(["root = List([t])", 't = Text("not an item")'])).toEqual([{ line: 2, code: "list_mismatch" }, { line: 1, code: "dangling_ref" }]);
    expect(parse(['t = Text("not an item")', "root = List([t])"])).toEqual([{ line: 2, code: "list_mismatch" }, { line: undefined, code: "missing_root" }]);
  });

  it("a ListItem may only sit inside a List", () => {
    expect(parse(["root = Stack([i])", 'i = ListItem("Tote")'])).toEqual([{ line: 2, code: "list_mismatch" }, { line: 1, code: "dangling_ref" }]);
  });

  it("a DateInput's state must be a YYYY-MM-DD date or empty", () => {
    expect(parse(["root = Stack([a, b])", '$a = ""', 'a = DateInput($a, label="A")', '$b = "2026-10-14"', 'b = DateInput($b, label="B")'])).toEqual([]);
    expect(parse(['$c = "next Tuesday"', 'root = DateInput($c, label="C")'])).toEqual([
      { line: 2, code: "input_state_type" },
      { line: undefined, code: "missing_root" },
    ]);
  });
});

describe("rendering the new components", () => {
  const BOOKING = [
    "root = Card([photo, stars, dates, echo, items, chat])",
    'photo = Image("cabin-pines", alt="A wooden cabin among pine trees", ratio="16:9")',
    "stars = Rating(4.96)",
    '$checkIn = "2026-10-14"',
    'dates = DateInput($checkIn, label="Check-in")',
    "echo = Text($checkIn)",
    "items = List([shirt])",
    'shirt = ListItem("Linen overshirt", detail="Sand · M", trailing="$128.00", image="shirt")',
    "chat = Stack([q, a])",
    'q = Message("<b>Any quiet beaches?</b>", from="user")',
    'a = Message("Try Praia da Ursa.", from="assistant")',
  ];

  it("shows only the registered picture, with its alt text and no referrer", () => {
    renderOmni({ lines: BOOKING });
    const img = screen.getByRole("img", { name: "A wooden cabin among pine trees" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(ASSETS["cabin-pines"]!.src);
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.className).toContain("omni-ratio--16-9");
  });

  it("shows the alt text when the renderer doesn't have the picture", () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    parser.write('root = Image("cabin-pines", alt="A wooden cabin")\n');
    render(<OmniRenderer store={parser.store} tools={TOOLS} assets={{}} onMutation={() => {}} />);
    const fallback = screen.getByRole("img", { name: "A wooden cabin" });
    expect(fallback.tagName).toBe("DIV");
    expect(fallback.textContent).toBe("A wooden cabin");
  });

  it("describes a Rating for screen readers and clamps state values to max", () => {
    renderOmni({ lines: BOOKING });
    expect(screen.getByRole("img", { name: "Rated 4.96 out of 5" })).toBeTruthy();
    cleanup();
    renderOmni({ lines: ["$score = 9", "root = Rating($score)"] });
    expect(screen.getByRole("img", { name: "Rated 5 out of 5" })).toBeTruthy();
  });

  it("a DateInput edits its state, and components using the state update", () => {
    renderOmni({ lines: BOOKING });
    const input = screen.getByLabelText("Check-in") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(screen.getByText("2026-10-14")).toBeTruthy();
    fireEvent.change(input, { target: { value: "2026-10-20" } });
    expect(screen.getByText("2026-10-20")).toBeTruthy();
  });

  it("renders a List with list semantics and a decorative thumbnail", () => {
    renderOmni({ lines: BOOKING });
    expect(screen.getByRole("list")).toBeTruthy();
    const item = screen.getByRole("listitem");
    expect(item.textContent).toContain("Linen overshirt");
    expect(item.textContent).toContain("$128.00");
    expect(item.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("labels who sent each Message, and shows markup as text", () => {
    const h = renderOmni({ lines: BOOKING });
    const user = h.container.querySelector(".omni-message--user")!;
    expect(user.textContent).toBe("You: <b>Any quiet beaches?</b>");
    expect(user.querySelector("b")).toBeNull();
    expect(h.container.querySelector(".omni-message--assistant")!.textContent).toBe("Assistant: Try Praia da Ursa.");
  });
});
