// @vitest-environment jsdom
// Playground Task H: the whole page against the real Express app and MockModel, in-process.
// Real generate(), real createMutationHandler(), real fetch; no network beyond localhost, no cost.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MockModel } from "../server/models/mock";
import { Playground, EXAMPLE_PROMPTS } from "../playground/Playground";
import { startServer } from "./serverHelpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  cleanup();
  await server?.close();
  server = null;
});

const FIXTURE_FOR: Record<string, string> = {
  "a payment confirmation for $42.50": "payment-confirmation",
  "a sign-in page": "sign-in",
  "edit my profile": "profile-settings",
  "where is my order?": "order-status",
  "contact support": "support-contact",
  "book a stay": "landing/booking",
  "my shopping bag": "landing/checkout",
  "a trip assistant": "landing/assistant",
};

const status = () => screen.getByRole("status").textContent ?? "";
const sourceLines = () => [...document.querySelectorAll(".pg-line")];
const actions = () => within(screen.getByRole("region", { name: "Actions" }));

async function open(model = new MockModel({ speed: "instant", seed: 3 })) {
  server = await startServer({ model });
  const user = userEvent.setup();
  render(<Playground baseUrl={server.url} />);
  await screen.findByText("mock model · free");
  return user;
}

async function runExample(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.click(screen.getByRole("button", { name: prompt }));
  await waitFor(() => expect(status()).not.toMatch(/^Generating/), { timeout: 10_000 });
}

describe("playground end to end", () => {
  it.each(EXAMPLE_PROMPTS)("%s streams the matching screen with no issues", async (prompt) => {
    const user = await open();
    await runExample(user, prompt);
    expect(status()).toMatch(/^Done in \d+ ms \(model: mock\)\.$/);
    const fixture = readFileSync(resolve("fixtures", `${FIXTURE_FOR[prompt]}.omni`), "utf8");
    expect(sourceLines()).toHaveLength(fixture.trimEnd().split("\n").length);
    expect(document.querySelector(".pg-line[data-severity]")).toBeNull();
    expect(document.querySelector("[data-pending-id], [data-fallback-reason]")).toBeNull();
  });

  it("a governed click goes through /api/mutate and shows the stub receipt", async () => {
    const user = await open();
    await runExample(user, "a payment confirmation for $42.50");
    await user.type(screen.getByLabelText("Note for merchant (optional)"), "Table 4");
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    const sent = await actions().findByText("Sent");
    expect(sent.closest("li")!.textContent).toMatch(/payments\.confirm → .*"receiptId":"rcpt_/);
    expect(server!.logs).toContainEqual(expect.objectContaining({ event: "mutate", tool: "payments.confirm", outcome: "ok" }));
  });

  it("Cancel stops the stream on the server too", async () => {
    const user = await open(new MockModel({ speed: "realistic", seed: 8 }));
    await user.click(screen.getByRole("button", { name: "edit my profile" }));
    await waitFor(() => expect(sourceLines().length).toBeGreaterThan(1), { timeout: 5_000 });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(status()).toMatch(/^Cancelled\./));
    await waitFor(() =>
      expect(server!.logs).toContainEqual(expect.objectContaining({ event: "generate", outcome: "client_disconnected" })),
    );
    expect(document.querySelectorAll('[data-fallback-reason="missing"]').length).toBeGreaterThan(0);
  });

  it("demo: unknown tool marks the rejected line and leaves Pay disabled", async () => {
    const user = await open();
    await runExample(user, "demo: unknown tool");
    const errorLines = [...document.querySelectorAll<HTMLElement>('.pg-line[data-severity="error"]')];
    const rejected = errorLines.find((el) => el.textContent!.includes("unknown_tool"))!;
    expect(rejected.textContent).toContain('tool="system.delete_account"');
    // …and so the Pay button's own line is flagged as ungoverned at the end of the stream.
    const pay = errorLines.find((el) => el.textContent!.includes("ungoverned_mutation"))!;
    expect(pay.textContent).toContain('confirm = Button("Pay now"');
    expect((screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("demo: model error offers Retry, which streams again", async () => {
    const user = await open();
    await runExample(user, "demo: model error");
    expect(status()).toMatch(/model failed partway through .*\(model_error\)/);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(status()).toMatch(/\(model_error\)/), { timeout: 10_000 });
    expect(server!.logs.filter((l) => l.event === "generate")).toHaveLength(2);
  });

  it("demo: missing child marks the line that referenced it, not a separate list", async () => {
    const user = await open();
    await runExample(user, "demo: missing child");
    const flagged = [...document.querySelectorAll<HTMLElement>('.pg-line[data-severity="error"]')];
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.textContent).toContain("root = Card([title, receipt, amount, actions])");
    expect(flagged[0]!.textContent).toContain('"root" references "receipt", which never arrived');
    expect(document.querySelector(".pg-doc-issues")).toBeNull();
    expect(document.querySelector('[data-fallback-reason="missing"]')?.getAttribute("data-node-id")).toBe("receipt");
  });

  it("demo: cut off explains itself and marks the missing parts", async () => {
    const user = await open();
    await runExample(user, "demo: cut off");
    expect(status()).toMatch(/cut short/);
    expect(document.querySelectorAll('[data-fallback-reason="missing"]').length).toBeGreaterThan(0);
  });

  it("an invalid request (too long) is reported without Retry", async () => {
    const user = await open();
    const input = screen.getByLabelText("Describe a screen") as HTMLInputElement;
    input.removeAttribute("maxlength"); // bypass the page's own limit to reach the server's
    await user.click(input);
    await user.paste("x".repeat(2001));
    await user.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(status()).toMatch(/\(invalid_request\)/));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
