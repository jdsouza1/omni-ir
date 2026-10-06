// @vitest-environment jsdom
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_CATALOG } from "@omni-ir/react";
import type { Catalog, CatalogProps } from "@omni-ir/react";
import { createStore } from "@omni-ir/core";
import { createParser } from "@omni-ir/core";
import { countingCatalog, renderOmni } from "./renderHelpers";

afterEach(cleanup);

const GOVERNED = [
  "root = Card([title, amount, note, actions])",
  'title = Heading("Confirm payment")',
  "$amount = 42.50",
  '$note = ""',
  'amount = Text($amount, format="currency", currency="USD")',
  'note = Input($note, label="Note")',
  "actions = Stack([confirm, cancel])",
  'confirm = Button("Pay now", action="pay")',
  'confirmPay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})',
  'cancel = Button("Cancel", variant="secondary")',
];

describe("catalog rendering", () => {
  it("renders every catalog type", () => {
    const { container } = renderOmni({
      lines: [
        "root = Stack([card, badge, divider, skel])",
        'card = Card([h, t, i], title="Card title")',
        'h = Heading("Heading", level=1)',
        't = Text("Body text", tone="muted")',
        '$v = "typed"',
        'i = Input($v, label="Field", placeholder="…")',
        'badge = Badge("New", tone="success")',
        "divider = Divider()",
        "skel = Skeleton(lines=3)",
      ],
    });
    expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeTruthy();
    expect(screen.getByText("Card title")).toBeTruthy();
    expect(screen.getByText("Body text").className).toContain("omni-text--muted");
    expect((screen.getByLabelText("Field") as HTMLInputElement).value).toBe("typed");
    expect(screen.getByText("New").className).toContain("omni-badge--success");
    expect(container.querySelector("hr")).toBeTruthy();
    expect(container.querySelectorAll(".omni-skeleton__line")).toHaveLength(3);
  });

  it("formats a currency Text from state", () => {
    renderOmni({ lines: ["$amount = 42.5", 'root = Text($amount, format="currency", currency="USD")'] });
    expect(screen.getByText("$42.50")).toBeTruthy();
  });

  it("formats a date-only Text as that calendar day in any time zone", () => {
    renderOmni({ lines: ['root = Text("2026-09-30", format="date")'] });
    expect(screen.getByText("Sep 30, 2026")).toBeTruthy();
  });

  it("shows an unparseable date as the raw text instead of crashing", () => {
    renderOmni({ lines: ['root = Text("next Tuesday", format="date")'] });
    expect(screen.getByText("next Tuesday")).toBeTruthy();
  });

  it("renders markup in strings as plain text, never as HTML", () => {
    const { container } = renderOmni({ lines: ['root = Text("<b onclick=alert(1)>hi</b>")'] });
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b onclick=alert(1)>hi</b>")).toBeTruthy();
  });
});

describe("streaming: Skeletons and fallbacks (R5)", () => {
  it("shows a Skeleton for root before it arrives, and for each pending child", () => {
    const h = renderOmni();
    expect(h.container.querySelector('[data-pending-id="root"]')).toBeTruthy();
    h.stream("root = Card([title, body])");
    expect(h.container.querySelector('[data-pending-id="title"]')).toBeTruthy();
    expect(h.container.querySelector('[data-pending-id="body"]')).toBeTruthy();
    h.stream('title = Heading("Hi")');
    expect(h.container.querySelector('[data-pending-id="title"]')).toBeNull();
    expect(screen.getByText("Hi")).toBeTruthy();
  });

  it("shows an Input as a Skeleton until its $state line arrives (R1)", () => {
    const h = renderOmni({ lines: ['root = Input($note, label="Note")'] });
    expect(h.container.querySelector('[data-pending-id="root"]')).toBeTruthy();
    h.stream('$note = "draft"');
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("draft");
  });

  it("replaces a child that never arrived with a 'missing' fallback, keeping sibling order", () => {
    const h = renderOmni({ lines: ["root = Stack([a, ghost, b])", 'a = Text("first")', 'b = Text("last")'] });
    h.end();
    const body = h.container.querySelector(".omni-stack")!;
    expect([...body.children].map((el) => el.textContent)).toEqual(["first", "Component failed to load", "last"]);
    expect(body.children[1]!.getAttribute("data-fallback-reason")).toBe("missing");
    expect(h.container.querySelector("[data-pending-id]")).toBeNull();
  });
});

describe("interaction and governance (R1, R5, R6)", () => {
  it("calls onMutation exactly once with state-filled params when a governed Button is clicked", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: GOVERNED });
    const pay = screen.getByRole("button", { name: "Pay now" });
    expect(pay.getAttribute("data-mcp-tool")).toBe("payments.confirm");
    await user.click(pay);
    expect(h.onMutation).toHaveBeenCalledTimes(1);
    expect(h.onMutation).toHaveBeenCalledWith({
      id: "confirmPay",
      target: "confirm",
      tool: "payments.confirm",
      params: { amount: 42.5, note: "" },
    });
  });

  it("keeps a mutating Button disabled until its McpMutation line arrives", async () => {
    const h = renderOmni({ lines: GOVERNED.filter((l) => !l.startsWith("confirmPay")) });
    const pay = screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    h.stream(GOVERNED.find((l) => l.startsWith("confirmPay"))!);
    expect(pay.disabled).toBe(false);
  });

  it("never sends a local Button press to onMutation", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: GOVERNED });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onMutation).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({ type: "press", id: "cancel" });
  });

  it("updates a Text bound to the same state as an Input while typing", async () => {
    const user = userEvent.setup();
    renderOmni({ lines: ["root = Stack([i, echo])", '$name = ""', 'i = Input($name, label="Name")', "echo = Text($name)"] });
    await user.type(screen.getByLabelText("Name"), "Ada");
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("sends the typed Input value in the mutation params", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: GOVERNED });
    await user.type(screen.getByLabelText("Note"), "Thanks, see you (soon)");
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    expect(h.onMutation.mock.calls[0]![0].params).toEqual({ amount: 42.5, note: "Thanks, see you (soon)" });
  });

  it("blocks a tool that is not in the registry even if it bypassed the parser", async () => {
    const user = userEvent.setup();
    const store = createStore();
    store.apply({ kind: "node", id: "root", type: "Button", props: { label: "Delete", action: "del" }, children: [] });
    store.apply({ kind: "mutation", id: "m", target: "root", tool: "system.delete_account", params: {} });
    const parser = { store } as unknown as ReturnType<typeof createParser>;
    const h = renderOmni({ parser });
    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.getAttribute("data-mcp-error")).toBe("true");
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("not a permitted action");
    await user.click(button);
    expect(h.onMutation).not.toHaveBeenCalled();
  });

  it("blocks params that fail the tool schema at click time, and recovers when the value is fixed", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: GOVERNED });
    const note = screen.getByLabelText("Note");
    const pay = screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement;

    await user.click(note);
    await user.paste("x".repeat(600)); // the tool allows at most 500
    await user.click(pay);
    expect(h.onMutation).not.toHaveBeenCalled();
    expect(pay.getAttribute("data-mcp-error")).toBe("true");
    expect(pay.disabled).toBe(true);
    expect(h.errors()).toEqual(["mutation_blocked"]);

    await user.clear(note);
    await user.type(note, "ok");
    expect(pay.disabled).toBe(false);
    expect(pay.getAttribute("data-mcp-error")).toBeNull();
    await user.click(pay);
    expect(h.onMutation).toHaveBeenCalledTimes(1);
  });

  it("reports a failing onMutation handler instead of throwing", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: GOVERNED });
    h.onMutation.mockImplementation(() => {
      throw new Error("network down");
    });
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    expect(h.errors()).toEqual(["handler_failed"]);
  });
});

describe("stable keys and crash isolation (R3, R7)", () => {
  it("mounts each IR id exactly once while 20+ more lines stream in", () => {
    const mounts = new Map<string, number>();
    const h = renderOmni({ catalog: countingCatalog(mounts) });
    const ids = Array.from({ length: 22 }, (_, i) => `t${i}`);
    h.stream(`root = Stack([${ids.join(", ")}])`);
    for (const id of ids) h.stream(`${id} = Text("row ${id}")`);
    h.end();
    expect(mounts.get("root")).toBe(1);
    for (const id of ids) expect(mounts.get(id), id).toBe(1);
  });

  it("keeps an Input's focus and cursor while new lines stream in", async () => {
    const user = userEvent.setup();
    const h = renderOmni({ lines: ["root = Stack([i, a, b])", '$v = ""', 'i = Input($v, label="Field")'] });
    const input = screen.getByLabelText("Field") as HTMLInputElement;
    await user.type(input, "hel");
    h.stream('a = Text("arrives while typing")');
    h.stream("b = Divider()");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);
    await user.keyboard("lo");
    expect(input.value).toBe("hello");
  });

  it("contains a crashing component to its own slot and recovers when its data changes", async () => {
    const user = userEvent.setup();
    const Fragile = (p: CatalogProps<"Text">) => {
      if (p.props.text === "boom") throw new Error("catalog bug");
      return <DEFAULT_CATALOG.Text {...p} />;
    };
    const catalog: Catalog = { ...DEFAULT_CATALOG, Text: Fragile };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const h = renderOmni({
      catalog,
      lines: [...GOVERNED.slice(0, 7).map((l) => l.replace("[title, amount, note, actions]", "[title, amount, note, actions, risky]")), ...GOVERNED.slice(7), '$r = "boom"', "risky = Text($r)"],
    });

    const fallback = h.container.querySelector('[data-fallback-reason="crashed"]');
    expect(fallback?.getAttribute("data-node-id")).toBe("risky");
    expect(h.events).toContainEqual(expect.objectContaining({ type: "error", issue: expect.objectContaining({ code: "node_crashed", id: "risky" }) }));

    // The rest of the UI still works.
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    expect(h.onMutation).toHaveBeenCalledTimes(1);

    // New data for the crashed node lets it retry.
    act(() => h.parser.store.setState("$r", "fine now"));
    expect(h.container.querySelector('[data-fallback-reason="crashed"]')).toBeNull();
    expect(screen.getByText("fine now")).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("versions (SPEC.md section 8)", () => {
  const notice = /needs an update/i;

  it("tells the person the app needs an update when the stream was written for a newer version, and still shows the screen", () => {
    renderOmni({ lines: ["# omni-ir 99.0", "root = Card([t])", 't = Text("Shown anyway")'] });
    expect(screen.getByRole("status").textContent).toMatch(notice);
    expect(screen.getByText("Shown anyway")).toBeTruthy();
  });

  it("shows no notice for this version, an older one, or no marker", () => {
    for (const first of ["# omni-ir 0.0", "# just a comment", 'root = Text("x")']) {
      renderOmni({ lines: [first, 'root = Text("x")'] });
      expect(screen.queryByText(notice), first).toBeNull();
      cleanup();
    }
  });
});
