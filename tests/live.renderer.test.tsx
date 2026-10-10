// @vitest-environment jsdom
// Updates in the React renderer (SPEC.md [8.8], [10.29]): what stays on the screen keeps its place,
// focus and what the person typed; only Notices are announced.
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const ORDER = [
  "root = Card([status, eta, tabs, note, ret], title=\"Order 1042\")",
  'status = Badge("Shipped")',
  '$eta = "Friday"',
  'eta = Text($eta)',
  "tabs = Tabs([items, address])",
  'items = Tab("Items", [itemsText])',
  'itemsText = Text("One tote")',
  'address = Tab("Address", [addressText])',
  'addressText = Text("12 Pine Road")',
  '$note = ""',
  'note = Input($note, label="Note for the courier")',
  'ret = Button("Request a return", action="requestReturn")',
  'm = McpMutation(ret, tool="orders.requestReturn", params={order: "1042", reason: $note})',
];

function order() {
  const h = renderOmni({ lines: ORDER });
  h.end();
  const update = (...lines: string[]) => {
    let result: ReturnType<typeof h.parser.update> | undefined;
    act(() => {
      result = h.parser.update(lines.join("\n") + "\n");
    });
    return result!;
  };
  return { ...h, update };
}

describe("updates in the renderer [8.8]", () => {
  it("change what they assign, and keep focus and what the person is typing elsewhere", async () => {
    const { update } = order();
    const user = userEvent.setup();
    const field = screen.getByLabelText("Note for the courier");
    await user.type(field, "Leave it by the door");
    const tote = screen.getByText("One tote");

    expect(update('status = Badge("Out for delivery", tone="success")', '$eta = "Today by 6 pm"').applied).toBe(true);

    expect(screen.getByText("Out for delivery")).toBeTruthy();
    expect(screen.getByText("Today by 6 pm")).toBeTruthy();
    expect(screen.queryByText("Shipped")).toBeNull();
    // The very same elements: nothing restarted.
    expect(screen.getByLabelText("Note for the courier")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect((field as HTMLInputElement).value).toBe("Leave it by the door");
    expect(screen.getByText("One tote")).toBe(tote);
  });

  it("keep the Tab the person opened", async () => {
    const { update } = order();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Address" }));
    expect(screen.getByText("12 Pine Road")).toBeTruthy();
    update('addressText = Text("14 Pine Road")');
    expect(screen.getByText("14 Pine Road")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Address" }).getAttribute("aria-selected")).toBe("true");
  });

  it("remove what a parent stops listing, with its action", () => {
    const { update } = order();
    update('root = Card([status, eta, tabs, done], title="Order 1042")', 'done = Notice("Return requested. We\'ll email a label.", tone="success")');
    expect(screen.queryByRole("button", { name: "Request a return" })).toBeNull();
    expect(screen.queryByLabelText("Note for the courier")).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("Return requested. We'll email a label.");
  });

  it("announce the Notices they add or change, politely, and nothing else", () => {
    const { update, container } = order();
    const announcer = container.querySelector("[data-omni-announcer]")!;
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    update('status = Badge("Out for delivery")');
    expect(announcer.textContent).toBe("");
    update('root = Card([status, eta, tabs, note, ret, late], title="Order 1042")', 'late = Notice("Running late: now Saturday", title="Delivery")');
    expect(announcer.textContent).toBe("Delivery. Running late: now Saturday");
    update('$eta = "Saturday"');
    expect(announcer.textContent).toBe("");
  });

  it("change nothing on the screen when rejected", () => {
    const { update, container } = order();
    const before = container.innerHTML;
    const result = update('status = Badge("Delivered")', '$note = "typed by the server"');
    expect(result.applied).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(["live_field_conflict"]);
    expect(container.innerHTML).toBe(before);
  });
});
