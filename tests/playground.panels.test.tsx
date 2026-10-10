// @vitest-environment jsdom
// Playground Task F: actions panel and event log.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Playground } from "../playground/Playground";

afterEach(cleanup);

const PAYMENT = readFileSync(resolve("fixtures", "payment-confirmation.omni"), "utf8");

/** Routes /api/health and /api/mutate; records what was posted to /api/mutate. */
function fakeServer(mutate: (body: { tool: string; params: Record<string, unknown> }) => Response) {
  const posted: { tool: string; params: Record<string, unknown> }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, model: "mock" }));
    if (url.endsWith("/api/mutate")) {
      const body = JSON.parse(String(init?.body)) as { tool: string; params: Record<string, unknown> };
      posted.push(body);
      return mutate(body);
    }
    return new Response("{}", { status: 404 });
  };
  return { fetchFn, posted };
}

async function renderPasted(source: string, fetchFn: typeof fetch) {
  const user = userEvent.setup();
  render(<Playground generate={vi.fn()} fetch={fetchFn} />);
  await screen.findByText("mock model · free");
  await user.click(screen.getByRole("tab", { name: "Paste Omni-IR" }));
  fireEvent.change(screen.getByLabelText("Omni-IR lines"), { target: { value: source } });
  await user.click(screen.getByRole("button", { name: "Render" }));
  return user;
}

const actions = () => within(screen.getByRole("region", { name: "Actions" }));

describe("Actions panel", () => {
  it("starts with an explanation", async () => {
    await renderPasted(PAYMENT, fakeServer(() => new Response("{}")).fetchFn);
    expect(actions().getByText(/Click a button in the preview/)).toBeTruthy();
  });

  it("shows the server's result for a governed action", async () => {
    const server = fakeServer(() => new Response(JSON.stringify({ ok: true, result: { stub: true, receiptId: "rcpt_1234" } })));
    const user = await renderPasted(PAYMENT, server.fetchFn);
    await user.type(screen.getByLabelText("Note for merchant (optional)"), "Table 4");
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    // The app's confirmation (app/tools.ts CONFIRMATIONS), in the renderer's own dialog.
    expect((await screen.findByRole("alertdialog")).textContent).toContain("Pay $42.50?");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    const entry = await actions().findByText("Sent");
    expect(entry.closest("li")!.textContent).toContain("rcpt_1234");
    expect(entry.closest("li")!.textContent).toContain("payments.confirm");
    expect(server.posted).toEqual([{ tool: "payments.confirm", params: { amount: 42.5, note: "Table 4" } }]);
  });

  it("shows a server refusal", async () => {
    const server = fakeServer(
      () => new Response(JSON.stringify({ error: { code: "unknown_tool", message: '"payments.confirm" is not a permitted action.' } }), { status: 403 }),
    );
    const user = await renderPasted(PAYMENT, server.fetchFn);
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    const entry = await actions().findByText("Refused by server");
    expect(entry.closest("li")!.textContent).toContain("not a permitted action");
  });

  it("shows an action blocked in the browser without contacting the server", async () => {
    const server = fakeServer(() => new Response("{}"));
    const user = await renderPasted(PAYMENT, server.fetchFn);
    await user.click(screen.getByLabelText("Note for merchant (optional)"));
    await user.paste("x".repeat(600));
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    expect(await actions().findByText("Blocked in browser")).toBeTruthy();
    expect(server.posted).toEqual([]);
  });

  it("shows that a local button sent nothing", async () => {
    const server = fakeServer(() => new Response("{}"));
    const user = await renderPasted(PAYMENT, server.fetchFn);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const entry = await actions().findByText("Local only");
    expect(entry.closest("li")!.textContent).toContain("cancel");
    expect(server.posted).toEqual([]);
  });
});

describe("Event log", () => {
  it("is collapsed by default and counts the run's events", async () => {
    await renderPasted('root = Card([t])\nt = Text("hi")', fakeServer(() => new Response("{}")).fetchFn);
    const log = document.querySelector<HTMLDetailsElement>("details.pg-log")!;
    expect(log.open).toBe(false);
    const summary = log.querySelector("summary")!.textContent!;
    expect(summary).toMatch(/^Event log \(\d+\)$/);
    const texts = [...log.querySelectorAll(".pg-log-entry")].map((el) => el.textContent);
    expect(texts.some((t) => t!.includes("node") && t!.includes("root (line 1)"))).toBe(true);
    expect(texts.some((t) => t!.includes("pending") && t!.includes("t → placeholder"))).toBe(true);
  });

  it("marks errors, and starts fresh for each run", async () => {
    const user = await renderPasted('root = Iframe("x")', fakeServer(() => new Response("{}")).fetchFn);
    const errorEntries = () => document.querySelectorAll('.pg-log-entry[data-tone="error"]');
    expect(errorEntries().length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Omni-IR lines"), { target: { value: 'root = Heading("ok")' } });
    await user.click(screen.getByRole("button", { name: "Render" }));
    expect(errorEntries().length).toBe(0);
  });
});
