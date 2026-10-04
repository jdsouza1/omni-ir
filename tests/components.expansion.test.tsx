// @vitest-environment jsdom
// Step 10: rendering Select, Switch, Table/TableRow, Tabs/Tab and Notice (PLAN-CATALOG.md, B.1).
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

/** Shown unless it, or a panel around it, is hidden. */
const shown = (el: HTMLElement) => el.closest("[hidden]") === null;
const text = (h: { container: HTMLElement }, id: string) => h.container.querySelector(`[data-node-id="${id}"]`)?.textContent;

describe("Select", () => {
  it("edits its text state, and every use of that state shows the choice", async () => {
    const h = renderOmni({
      lines: ["root = Stack([size, echo])", '$size = ""', 'size = Select($size, label="Size", options=["Small", "Large"], placeholder="Choose a size")', "echo = Text($size)"],
    });
    const select = screen.getByLabelText("Size") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("");
    expect(select.selectedOptions[0]?.textContent).toBe("Choose a size");
    await userEvent.selectOptions(select, "Large");
    expect(text(h, "echo")).toBe("Large");
    expect(h.onMutation).not.toHaveBeenCalled();
  });

  it("shows nothing chosen when the state holds a value that isn't an option", () => {
    renderOmni({ lines: ["root = Stack([size])", '$size = "XL"', 'size = Select($size, label="Size", options=["S", "M"])'] });
    expect((screen.getByLabelText("Size") as HTMLSelectElement).value).toBe("");
  });
});

describe("Switch", () => {
  it("flips its true/false state, exposed as a switch", async () => {
    const h = renderOmni({ lines: ["root = Stack([news, echo])", "$news = false", 'news = Switch($news, label="Email me order updates")', "echo = Text($news)"] });
    const toggle = screen.getByRole("switch", { name: "Email me order updates" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(text(h, "echo")).toBe("true");
    expect(h.onMutation).not.toHaveBeenCalled();
  });
});

describe("Table", () => {
  it("is a table to assistive technology, with headings, rows and end-aligned numbers", () => {
    renderOmni({ lines: ['root = Table(["Plan", "Price", "Projects"], [a, b])', 'a = TableRow(["Basic", "$12", 3])', 'b = TableRow(["Pro", "$29", "Unlimited"])'] });
    const table = screen.getByRole("table");
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Plan", "Price", "Projects"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    const cells = screen.getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["Basic", "$12", "3", "Pro", "$29", "Unlimited"]);
    expect(cells[2]!.className).toContain("omni-table__cell--number");
    expect(cells[1]!.className).not.toContain("--number");
    expect(table.closest(".omni-table-wrap")).not.toBeNull();
  });

  it("streams row by row: a row not yet arrived is a placeholder in its place", () => {
    const h = renderOmni({ lines: ['root = Table(["Plan"], [a, b])', 'a = TableRow(["Basic"])'] });
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["Basic"]);
    expect(h.container.querySelector('[data-pending-id="b"]')).not.toBeNull();
    h.stream('b = TableRow(["Pro"])');
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toEqual(["Basic", "Pro"]);
  });
});

describe("Tabs", () => {
  const lines = [
    "root = Tabs([profile, alerts])",
    'profile = Tab("Profile", [name])',
    'name = Text("Ada")',
    'alerts = Tab("Notifications", [note])',
    'note = Text("All quiet")',
  ];

  it("opens the first Tab, and switches when another is picked", async () => {
    renderOmni({ lines });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Profile", "Notifications"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(shown(screen.getByText("Ada"))).toBe(true);
    expect(shown(screen.getByText("All quiet"))).toBe(false);
    await userEvent.click(tabs[1]!);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(shown(screen.getByText("All quiet"))).toBe(true);
    expect(shown(screen.getByText("Ada"))).toBe(false);
  });

  it("switches with the arrow, Home and End keys, moving focus with it", () => {
    renderOmni({ lines });
    const tabs = screen.getAllByRole("tab");
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1]!, { key: "ArrowRight" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[1]!, { key: "Home" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("shows a Tab's label once its line arrives, and keeps the open Tab while the stream grows", async () => {
    const h = renderOmni({ lines: ["root = Tabs([profile, alerts])", 'profile = Tab("Profile", [name])', 'name = Text("Ada")'] });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Profile", "…"]);
    await userEvent.click(screen.getAllByRole("tab")[1]!);
    h.stream('alerts = Tab("Notifications", [note])', 'note = Text("All quiet")');
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Profile", "Notifications"]);
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(shown(screen.getByText("All quiet"))).toBe(true);
  });
});

describe("Notice", () => {
  it("shows its title and text, with its tone", () => {
    const h = renderOmni({ lines: ['root = Notice("Payments are paused.", tone="warning", title="Heads up")'] });
    const notice = screen.getByRole("note");
    expect(notice.textContent).toBe("Heads upPayments are paused.");
    expect(notice.className).toContain("omni-notice--warning");
    expect(text(h, "root")).toContain("Payments are paused.");
  });
});
