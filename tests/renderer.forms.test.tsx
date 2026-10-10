// @vitest-environment jsdom
// Step 19 (PLAN-FORMS.md, A.3 and B): field messages and blocked presses ([8.5], [8.6]) and the app's
// confirmations ([9.1]–[9.3]) in the React renderer. The checks themselves are tested against the
// shared cases in tests/fields.test.ts.
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createParser } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const SIGN_UP = [
  "root = Card([email, terms, send])",
  '$email = ""',
  'email = Input($email, label="Email", required=true, format="email")',
  "$terms = false",
  'terms = Switch($terms, label="I accept the terms", required=true)',
  'send = Button("Email me a link", action="go")',
  'go = McpMutation(send, tool="auth.sendMagicLink", params={email: $email})',
];

describe("field messages [8.5]", () => {
  it("show after the person leaves the field, not while they type, tied to the field for screen readers", async () => {
    renderOmni({ lines: SIGN_UP });
    const user = userEvent.setup();
    const field = screen.getByLabelText("Email");
    await user.type(field, "ada");
    expect(screen.queryByText(/email address/)).toBeNull();
    await user.tab();
    const message = screen.getByText("Enter an email address, like name@example.com.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    // Fixing it clears the message.
    await user.clear(field);
    await user.type(field, "ada@example.com");
    expect(screen.queryByText(/email address/)).toBeNull();
    expect(field.getAttribute("aria-invalid")).toBeNull();
  });

  it("are the renderer's own words, replaceable by the app, with values filled in", async () => {
    renderOmni({
      lines: ["root = Card([bio])", '$bio = "abcdefgh"', 'bio = Input($bio, label="Bio", maxLength=5)'],
      rendererProps: { strings: { tooLong: "Max {max} chars" } },
    });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Bio"));
    await user.tab();
    expect(screen.getByText("Max 5 chars")).toBeTruthy();
  });

  it("an Input with maxLength stops typing past it on the web", () => {
    renderOmni({ lines: ["root = Card([bio])", '$bio = ""', 'bio = Input($bio, label="Bio", maxLength=5)'] });
    expect(screen.getByLabelText("Bio").getAttribute("maxlength")).toBe("5");
  });
});

describe("a press with invalid fields [8.6]", () => {
  it("doesn't run the action and shows every field the params read", async () => {
    const h = renderOmni({ lines: SIGN_UP });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Email me a link" }));
    expect(h.onMutation).not.toHaveBeenCalled();
    expect(screen.getByText("This is required.")).toBeTruthy();
    // The Switch isn't read by the params: it's not shown or blocking on this press.
    expect(screen.queryByText("Turn this on to continue.")).toBeNull();
    expect(h.errors()).toEqual([]); // not a mutation_blocked: nothing was sent to the tool's check
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));
    expect(h.onMutation).toHaveBeenCalledTimes(1);
    expect(h.onMutation.mock.calls[0]![0]).toMatchObject({ tool: "auth.sendMagicLink", params: { email: "ada@example.com" } });
  });

  it("a field no params read still gets its message after it's left, but blocks nothing", async () => {
    const h = renderOmni({ lines: SIGN_UP.map((l) => l.replace("$email = \"\"", '$email = "ada@example.com"')) });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("I accept the terms"));
    await user.click(screen.getByLabelText("I accept the terms"));
    await user.tab();
    expect(screen.getByText("Turn this on to continue.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Email me a link" }));
    expect(h.onMutation).toHaveBeenCalledTimes(1);
  });
});

const PAY = [
  "root = Card([amount, pay])",
  "$amount = 42.5",
  'amount = Text($amount, format="currency")',
  'pay = Button("Pay", action="go")',
  'go = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: "Lunch <b>now</b> {amount}"})',
];

describe("confirmations [9.1]", () => {
  it("open the renderer's own dialog with the app's sentence, and run the action only on Confirm", async () => {
    const h = renderOmni({ lines: PAY, rendererProps: { confirm: { "payments.confirm": "Pay {amount} now? Note: {note}" } } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pay" }));
    const dialog = screen.getByRole("alertdialog");
    // Params fill the sentence once, as plain text: markup and placeholders in them stay literal.
    expect(dialog.textContent).toContain("Pay 42.5 now? Note: Lunch <b>now</b> {amount}");
    expect(dialog.querySelector("b")).toBeNull();
    expect(h.onMutation).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.onMutation).toHaveBeenCalledTimes(1);
  });

  it("Cancel, or Escape, closes it without running the action and returns focus to the button", async () => {
    const h = renderOmni({ lines: PAY, rendererProps: { confirm: { "payments.confirm": "Pay {amount}?" } } });
    const user = userEvent.setup();
    const pay = screen.getByRole("button", { name: "Pay" });
    await user.click(pay);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(pay);
    await user.click(pay);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.onMutation).not.toHaveBeenCalled();
  });

  it("tools without a sentence run at once", async () => {
    const h = renderOmni({ lines: PAY, rendererProps: { confirm: { "account.delete": "Delete?" } } });
    await userEvent.setup().click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.onMutation).toHaveBeenCalledTimes(1);
  });
});

describe("the stream can't skip, change or imitate a confirmation [9.2]", () => {
  it("nothing in the stream turns it off or changes its words", async () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    const rejected: string[] = [];
    parser.subscribe((e) => e.type === "error" && rejected.push(e.issue.code));
    const h = renderOmni({
      parser,
      lines: [
        "root = Card([pay])",
        'pay = Button("Pay", action="go")',
        'other = Button("Pay without asking", action="go", confirm=false)',
        'go = McpMutation(pay, tool="payments.confirm", params={amount: 1, note: "x"}, confirm="no")',
      ],
      rendererProps: { confirm: { "payments.confirm": "Pay {amount}?" } },
    });
    // Both lines with a made-up prop are rejected by the strict catalog; the button never becomes governed.
    expect(rejected).toEqual(["invalid_props", "invalid_props"]);
    h.stream('go = McpMutation(pay, tool="payments.confirm", params={amount: 1, note: "x"})');
    await userEvent.setup().click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Pay 1?");
    expect(h.onMutation).not.toHaveBeenCalled();
  });
});

describe("the order of checks [9.3]", () => {
  it("fields first, then the tool's schema, then the confirmation", async () => {
    const h = renderOmni({
      lines: [
        "root = Card([note, pay])",
        '$note = ""',
        'note = Input($note, label="Note", required=true)',
        "$amount = -1",
        'pay = Button("Pay", action="go")',
        'go = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: $note})',
      ],
      rendererProps: { confirm: { "payments.confirm": "Pay {amount}?" } },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.getByText("This is required.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.errors()).toEqual([]);
    await user.type(screen.getByLabelText("Note"), "Lunch");
    await user.click(screen.getByRole("button", { name: "Pay" }));
    // amount -1 fails the tool's schema: blocked before any confirmation is asked.
    expect(h.errors()).toEqual(["mutation_blocked"]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    act(() => h.parser.store.setState("$amount", 5));
    await user.click(screen.getByRole("button", { name: "Pay" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
