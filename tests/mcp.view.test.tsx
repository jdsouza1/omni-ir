// @vitest-environment jsdom
// Step 18 (PLAN-MCPAPPS.md, A): the bridge's view, driven by the MCP Apps SDK's own host side
// (AppBridge) over an in-memory transport, as Claude or ChatGPT would drive it. No network.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { IDEMPOTENCY_META_KEY, viewConfig } from "@omni-ir/mcp";
import { createViewController, OmniMcpView } from "../packages/mcp/src/view/View";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";

const config = viewConfig({ tools: TOOLS, assets: ASSETS });

// jsdom has no ResizeObserver; the SDK uses one to tell the host the view's height.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

async function host(hostContext: Record<string, unknown> = {}) {
  const calls: { name: string; arguments: unknown; _meta: unknown }[] = [];
  const bridge = new AppBridge(null, { name: "test-host", version: "1.0.0" }, { serverTools: {} }, { hostContext });
  let answer: (name: string) => { isError?: boolean; content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown> } = () => ({ content: [{ type: "text", text: "Done." }] });
  bridge.oncalltool = async (params) => {
    calls.push({ name: params.name, arguments: params.arguments, _meta: params._meta });
    return answer(params.name);
  };
  const initialized = new Promise<void>((resolve) => (bridge.oninitialized = () => resolve()));
  const [hostSide, viewSide] = InMemoryTransport.createLinkedPair();
  await bridge.connect(hostSide);
  const app = new App({ name: "omni-ir-view", version: "test" });
  const controller = createViewController(app, config);
  await app.connect(viewSide);
  await initialized;
  const view = render(<OmniMcpView controller={controller} />);
  return { bridge, calls, view, controller, setAnswer: (f: typeof answer) => (answer = f) };
}

/** Let the in-memory transport deliver, then let React render. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));

afterEach(cleanup);

describe("the bridge's view [10.26]", () => {
  it("draws the screen line by line while the model is still writing the tool's argument", async () => {
    const { bridge } = await host();
    await bridge.sendToolInputPartial({ arguments: { screen: 'root = Card([title, note])\ntitle = Heading("Your trip")\nnote = Te' } });
    await settle();
    expect(screen.getByRole("heading", { name: "Your trip" })).toBeTruthy();
    expect(screen.queryByText("Packed and ready.")).toBeNull();
    await bridge.sendToolInput({ arguments: { screen: 'root = Card([title, note])\ntitle = Heading("Your trip")\nnote = Text("Packed and ready.")' } });
    await settle();
    expect(screen.getByText("Packed and ready.")).toBeTruthy();
  });

  it("ends the parser on the complete argument: something that never arrived becomes a fallback, not a spinner", async () => {
    const { bridge, controller } = await host();
    await bridge.sendToolInput({ arguments: { screen: 'root = Card([title, missing])\ntitle = Heading("Hi")\n' } });
    await settle();
    expect(controller.getSnapshot().issues.map((i) => i.code)).toContain("dangling_ref");
  });

  it("a pressed button calls the app-only tool through the host, with params checked and a new idempotency key [10.28]", async () => {
    const { bridge, calls } = await host();
    await bridge.sendToolInput({
      arguments: { screen: 'root = Card([pay])\n$note = "Thanks"\npay = Button("Pay $5", action="go")\ngo = McpMutation(pay, tool="payments.confirm", params={amount: 5, note: $note})\n' },
    });
    await settle();
    await userEvent.click(screen.getByRole("button", { name: "Pay $5" }));
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "payments.confirm", arguments: { amount: 5, note: "Thanks" } });
    expect((calls[0]!._meta as Record<string, string>)[IDEMPOTENCY_META_KEY]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("shows the server's refusal as a failed action, in the renderer's own words", async () => {
    const { bridge, setAnswer, controller } = await host();
    setAnswer(() => ({ isError: true, content: [{ type: "text", text: "No such order." }], structuredContent: { code: "not_found", message: "No such order." } }));
    await bridge.sendToolInput({ arguments: { screen: 'root = Card([ret])\nret = Button("Return it", action="r")\nr = McpMutation(ret, tool="orders.requestReturn", params={orderId: "B7-2210"})\n' } });
    await settle();
    await userEvent.click(screen.getByRole("button", { name: "Return it" }));
    await settle();
    expect(controller.getSnapshot().issues.map((i) => i.code)).toContain("handler_failed");
  });

  it("never sends params that fail the tool's schema", async () => {
    const { bridge, calls, controller } = await host();
    await bridge.sendToolInput({ arguments: { screen: 'root = Card([pay])\npay = Button("Pay", action="go")\ngo = McpMutation(pay, tool="payments.confirm", params={amount: -5, note: ""})\n' } });
    await settle();
    await userEvent.click(screen.getByRole("button", { name: "Pay" }));
    await settle();
    expect(calls).toHaveLength(0);
    expect(controller.getSnapshot().issues.map((i) => i.code)).toContain("mutation_blocked");
  });

  it("takes the host's theme and colours (A.3)", async () => {
    const { bridge, view } = await host({ theme: "dark", styles: { variables: { "--color-background-primary": "#1b1b1b", "--color-text-primary": "#fafafa" } } });
    await bridge.sendToolInput({ arguments: { screen: 'root = Heading("Hi")\n' } });
    await settle();
    const root = view.container.querySelector(".omni-root") as HTMLElement;
    expect(root.dataset.theme).toBe("dark");
    // The frame's own scheme matches, so the browser doesn't paint it opaque inside a dark host.
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(view.container.querySelector("style")?.textContent).toContain("--omni-surface: #1b1b1b");
    await act(async () => void (await bridge.sendHostContextChange({ theme: "light" })));
    await settle();
    expect((view.container.querySelector(".omni-root") as HTMLElement).dataset.theme).toBe("light");
  });

});
