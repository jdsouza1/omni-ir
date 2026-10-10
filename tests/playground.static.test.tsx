// @vitest-environment jsdom
// The hosted playground (Step 12, B.3): the page with the in-browser API the static build uses,
// every fixture bundled in. The network is switched off: any real request fails the test.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPlaygroundFetch } from "../playground/inBrowserApi";
import { Playground, ERROR_DEMOS, EXAMPLE_PROMPTS } from "../playground/Playground";

const network = vi.fn(() => Promise.reject(new Error("the hosted playground must not use the network")));
beforeEach(() => vi.stubGlobal("fetch", network));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  network.mockClear();
});

const status = () => screen.getByRole("status").textContent ?? "";

async function open() {
  const user = userEvent.setup();
  render(<Playground fetch={createPlaygroundFetch("instant")} />);
  await screen.findByText("mock model · free");
  return user;
}

async function run(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.click(screen.getByRole("button", { name: prompt }));
  await waitFor(() => expect(status()).not.toMatch(/^Generating/), { timeout: 15_000 });
}

describe("hosted playground (no server, no network)", () => {
  it.each(EXAMPLE_PROMPTS)("%s streams its screen", async (prompt) => {
    const user = await open();
    await run(user, prompt);
    expect(status()).toMatch(/^Done in \d+ ms \(model: mock\)\.$/);
    expect(document.querySelector("[data-pending-id], [data-fallback-reason]")).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(ERROR_DEMOS)("%s shows its failure", async (prompt) => {
    const user = await open();
    await run(user, prompt);
    expect(status()).not.toBe("");
    expect(network).not.toHaveBeenCalled();
  });

  it("a governed click runs the stub tool in the browser", async () => {
    const user = await open();
    await run(user, "a payment confirmation for $42.50");
    await user.click(screen.getByRole("button", { name: "Pay now" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    const panel = within(screen.getByRole("region", { name: "Actions" }));
    await panel.findByText(/payments\.confirm → .*"receiptId":"rcpt_/);
    expect(network).not.toHaveBeenCalled();
  });
});
