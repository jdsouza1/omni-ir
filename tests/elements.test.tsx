// @vitest-environment jsdom
// <omni-screen> (Step 21, PLAN-ELEMENTS.md A, B): the React renderer inside a custom element, with
// registries and handlers as properties, plain settings as attributes, notices as events, styles in
// its shadow root, tool params as JSON Schema or Zod, and app components as the app's own custom
// elements. This file runs with React and again with Preact (npm run test:preact), which is what the
// published element is built on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { z } from "zod";
import "@omni-ir/elements";
import type { OmniScreenElement } from "@omni-ir/elements";
import { componentDeclarations } from "@omni-ir/core";
import { createInBrowserApi } from "../server/inBrowser";
import { MockModel } from "../server/models/mock";
import { APP_COMPONENTS, PICTURES } from "../app/components";

const PAY = [
  "root = Card([title, amount, pay])",
  'title = Heading("Confirm payment")',
  "$amount = 42.5",
  'amount = Text($amount, format="currency", currency="USD")',
  'pay = Button("Pay", action="go")',
  'go = McpMutation(pay, tool="payments.confirm", params={amount: $amount})',
].join("\n");

/** Tool params as JSON Schema: no build step, no Zod. */
const PAY_TOOLS = { "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"], additionalProperties: false } };

function mount(setup: (el: OmniScreenElement) => void = () => {}) {
  const el = document.createElement("omni-screen") as OmniScreenElement;
  setup(el);
  document.body.append(el);
  return el;
}

const shadow = (el: OmniScreenElement) => el.shadowRoot!;
const button = (el: OmniScreenElement, name: string) =>
  [...shadow(el).querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
/**
 * React draws at once; Preact subscribes to the screen after paint (an animation frame in a browser,
 * a short timer where there is none, as here) and draws then. Wait long enough for either.
 */
const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 60));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("<omni-screen>", () => {
  it("is defined on import, and draws a stream into its shadow root with the catalog's styles", async () => {
    expect(customElements.get("omni-screen")).toBeDefined();
    const el = mount((e) => (e.tools = PAY_TOOLS));
    await act(async () => {
      el.write(PAY);
      el.end();
    });
    await flush();
    expect(shadow(el).querySelector("h2, h1, h3")?.textContent).toBe("Confirm payment");
    expect(shadow(el).textContent).toContain("$42.50");
    // Styles live inside: the page's CSS can't reach in, and the tokens are set on the host.
    const style = shadow(el).querySelector("style")?.textContent ?? "";
    expect(style).toContain(":host");
    expect(style).toContain("--omni-accent");
    expect(el.children).toHaveLength(0);
  });

  it("runs an action through onMutation only after the params pass the tool's JSON Schema", async () => {
    const onMutation = vi.fn(async () => {});
    const events: string[] = [];
    const el = mount((e) => {
      e.tools = PAY_TOOLS;
      e.onMutation = onMutation;
      e.addEventListener("omni-event", (ev) => events.push((ev as CustomEvent).detail.type));
    });
    await act(async () => el.write(PAY + "\n"));
    await flush();
    await act(async () => button(el, "Pay")!.click());
    expect(onMutation).toHaveBeenCalledWith(expect.objectContaining({ tool: "payments.confirm", params: { amount: 42.5 } }));

    const blocked = mount((e) => {
      e.tools = PAY_TOOLS;
      e.onMutation = onMutation;
      e.addEventListener("omni-event", (ev) => events.push((ev as CustomEvent).detail.issue?.code ?? "press"));
    });
    await act(async () => blocked.write(PAY.replace("$amount = 42.5", "$amount = -1") + "\n"));
    await flush();
    await act(async () => button(blocked, "Pay")!.click());
    expect(onMutation).toHaveBeenCalledTimes(1);
    expect(events).toContain("mutation_blocked");
  });

  it("takes Zod schemas too", async () => {
    const onMutation = vi.fn(async () => {});
    const el = mount((e) => {
      e.tools = { "payments.confirm": z.strictObject({ amount: z.number().positive() }) };
      e.onMutation = onMutation;
    });
    await act(async () => el.write(PAY + "\n"));
    await flush();
    await act(async () => button(el, "Pay")!.click());
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("asks the app's confirmation in its own dialog, inside the shadow root", async () => {
    const onMutation = vi.fn(async () => {});
    const el = mount((e) => {
      e.tools = PAY_TOOLS;
      e.onMutation = onMutation;
      e.confirm = { "payments.confirm": (p: Readonly<Record<string, unknown>>) => `Pay $${Number(p.amount).toFixed(2)}?` };
    });
    await act(async () => el.write(PAY + "\n"));
    await flush();
    await act(async () => button(el, "Pay")!.click());
    await flush();
    expect(shadow(el).querySelector('[role="alertdialog"]')?.textContent).toContain("Pay $42.50?");
    expect(onMutation).not.toHaveBeenCalled();
    await act(async () => button(el, "Confirm")!.click());
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("keeps field checks: a required field blocks the press and shows its message", async () => {
    const onMutation = vi.fn(async () => {});
    const el = mount((e) => {
      e.tools = { "auth.sendMagicLink": { type: "object", properties: { email: { type: "string" } } } };
      e.onMutation = onMutation;
    });
    await act(async () =>
      el.write(['root = Card([email, send])', '$email = ""', 'email = Input($email, label="Email", required=true, format="email")', 'send = Button("Send", action="go")', 'go = McpMutation(send, tool="auth.sendMagicLink", params={email: $email})', ""].join("\n")),
    );
    await flush();
    await act(async () => button(el, "Send")!.click());
    await flush();
    expect(onMutation).not.toHaveBeenCalled();
    expect(shadow(el).textContent).toContain("This is required.");
  });

  it("follows its theme and locale attributes", async () => {
    const el = mount((e) => e.setAttribute("theme", "dark"));
    await act(async () => el.write('root = Text("Hi")\n'));
    await flush();
    expect(shadow(el).querySelector(".omni-root")?.getAttribute("data-theme")).toBe("dark");
    await act(async () => el.setAttribute("theme", "light"));
    await flush();
    expect(shadow(el).querySelector(".omni-root")?.getAttribute("data-theme")).toBe("light");
  });

  it("shows stream text as text, never markup", async () => {
    const el = mount();
    await act(async () => el.write('root = Text("<img src=x onerror=alert(1)>")\n'));
    await flush();
    expect(shadow(el).querySelector("img")).toBeNull();
    expect(shadow(el).textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("gives the screen as text, and starts a new screen on reset()", async () => {
    const el = mount((e) => (e.tools = PAY_TOOLS));
    await act(async () => el.write(PAY + "\n"));
    await flush();
    expect(el.describe()).toContain("Heading: Confirm payment");
    await act(async () => el.reset());
    await flush();
    expect(el.describe()).toBe("[loading]");
  });

  it("generates from an Omni-IR server and says when it's done", async () => {
    const api = createInBrowserApi({ model: new MockModel({ speed: "instant", seed: 1 }) });
    const done = vi.fn();
    const el = mount((e) => {
      e.tools = PAY_TOOLS;
      e.fetch = (input: RequestInfo | URL, init?: RequestInit) => api(String(input), init ?? {});
      e.addEventListener("omni-done", (ev) => done((ev as CustomEvent).detail.status));
    });
    let outcome: { status: string } | undefined;
    await act(async () => {
      outcome = await el.generate("a payment confirmation for $42.50");
    });
    expect(outcome?.status).toBe("done");
    expect(done).toHaveBeenCalledWith("done");
    await waitFor(() => expect(button(el, "Pay now")).toBeTruthy());
  });
});

describe("app components in <omni-screen> [8.7]", () => {
  class ProductCardElement extends HTMLElement {
    props: Record<string, unknown> = {};
    picture: ((name?: string) => { src: string } | undefined) | undefined;
    connectedCallback() {
      this.draw();
    }
    draw() {
      const pic = this.picture?.(this.props.picture as string | undefined);
      this.setAttribute("data-name", String(this.props.name ?? ""));
      this.setAttribute("data-picture", pic?.src ?? "");
    }
  }
  customElements.define("test-product-card", ProductCardElement);

  it("draws a declared component with the app's own custom element, props as properties, children inside", async () => {
    const el = mount((e) => {
      e.tools = { "cart.add": { type: "object" } };
      e.pictures = PICTURES;
      e.resolvePicture = (name: string) => (name === "product-1042" ? { src: "data:tote", width: 1, height: 1 } : undefined);
      e.components = { ProductCard: { ...componentDeclarations(APP_COMPONENTS).ProductCard!, tag: "test-product-card" } };
    });
    await act(async () =>
      el.write(['root = ProductCard("Canvas tote", [add], price=24, picture="product-1042")', 'add = Button("Add to bag")', ""].join("\n")),
    );
    await flush();
    const card = shadow(el).querySelector("test-product-card") as ProductCardElement;
    expect(card).toBeTruthy();
    expect(card.props).toMatchObject({ name: "Canvas tote", price: 24, picture: "product-1042" });
    card.draw();
    expect(card.getAttribute("data-picture")).toBe("data:tote");
    expect(card.querySelector("button")?.textContent).toBe("Add to bag");
  });

  it("shows the renderer's fallback for a declared component without a tag", async () => {
    const el = mount((e) => {
      e.components = { ProductCard: componentDeclarations(APP_COMPONENTS).ProductCard! };
    });
    await act(async () => el.write('root = ProductCard("Canvas tote", price=24)\n'));
    await flush();
    expect(shadow(el).querySelector('[data-fallback-reason="unsupported"]')).toBeTruthy();
  });

  it("refuses a bad declaration when it's set, not while reading a stream", () => {
    const el = mount();
    expect(() => (el.components = { Card: { description: "x", props: {}, tag: "x-card" } })).toThrow();
  });
});
