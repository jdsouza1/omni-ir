import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { createParser, type ParserEvent } from "@omni-ir/core";
import { MockModel } from "../server/models/mock";
import { ModelError } from "../server/models/types";

const fixture = (name: string) => readFileSync(resolve("fixtures", name), "utf8");

async function collect(model: MockModel, prompt: string, signal = new AbortController().signal) {
  const chunks: string[] = [];
  const result = await model.generate(prompt, { signal, onText: (t) => chunks.push(t) });
  return { chunks, text: chunks.join(""), result };
}

describe("fixtures", () => {
  const screens = readdirSync("fixtures").filter((f) => f.endsWith(".omni"));

  it("includes the eleven mock screens", () => {
    expect(screens.sort()).toEqual([
      "account-settings.omni",
      "demo-mode.omni",
      "order-breakdown.omni",
      "order-history.omni",
      "order-status.omni",
      "payment-confirmation.omni",
      "product.omni",
      "profile-settings.omni",
      "sales-dashboard.omni",
      "sign-in.omni",
      "support-contact.omni",
    ]);
  });

  it.each(screens)("%s parses with no errors, warnings or end-of-stream issues", (name) => {
    const parser = createParser({ tools: TOOLS, components: APP_COMPONENTS, pictures: PICTURES });
    const events: ParserEvent[] = [];
    parser.subscribe((e) => events.push(e));
    parser.write(fixture(name));
    expect(parser.end()).toEqual([]);
    expect(events.filter((e) => e.type === "error" || e.type === "warning")).toEqual([]);
  });
});

describe("MockModel routing", () => {
  const model = new MockModel({ speed: "instant" });

  it.each([
    ["a payment confirmation for $42.50", "payment-confirmation"],
    ["a product page for the canvas tote", "product"],
    ["Checkout screen please", "payment-confirmation"],
    ["a sign-in page", "sign-in"],
    ["LOGIN form", "sign-in"],
    ["edit my profile", "profile-settings"],
    ["account settings", "profile-settings"],
    ["where is my order?", "order-status"],
    ["track my delivery", "order-status"],
    ["contact support", "support-contact"],
    ["I need help", "support-contact"],
    ["book a stay", "landing/booking"],
    ["my shopping bag", "landing/checkout"],
    ["a trip assistant", "landing/assistant"],
    ["a weather dashboard", "demo-mode"],
    ["notification settings with a language picker", "account-settings"],
    ["my order history", "order-history"],
    ["a sales dashboard with charts", "sales-dashboard"],
    ["orders by channel as a pie", "order-breakdown"],
    ["a button that deletes my account", "variants/delete-account"],
    ["", "demo-mode"],
  ])("%j → %s", (prompt, screen) => {
    expect(model.route(prompt)).toBe(screen);
  });

  it("picks the screen with the most keyword matches", () => {
    expect(model.route("help me track my order shipping")).toBe("order-status");
  });

  it("matches whole words only", () => {
    expect(model.route("a helper for paying")).not.toBe("support-contact");
  });

  it.each([
    ["demo: unknown tool", "variants/unknown-tool"],
    ["Demo: Missing Child", "variants/dangling-child"],
    ["demo: missing mutation", "variants/missing-mutation"],
    ["demo: windows path", "variants/windows-path"],
    ["demo: cut off", "cut-off"],
    ["demo: model error", "model-error"],
    ["demo: nonsense", "demo-mode"],
  ])("%j → %s", (prompt, screen) => {
    expect(model.route(prompt)).toBe(screen);
  });
});

describe("MockModel streaming", () => {
  it("streams the matching fixture exactly, in several chunks", async () => {
    const { chunks, text, result } = await collect(new MockModel({ speed: "instant", seed: 1 }), "payment please");
    expect(text).toBe(fixture("payment-confirmation.omni"));
    expect(chunks.length).toBeGreaterThan(10);
    expect(result).toEqual({ stopReason: "end_turn", model: "mock" });
  });

  it("never splits a character across chunks", async () => {
    const { chunks } = await collect(new MockModel({ speed: "instant", seed: 3 }), "payment");
    for (const chunk of chunks) expect(chunk).not.toMatch(/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/);
  });

  it("chunks the same way for the same seed", async () => {
    const a = await collect(new MockModel({ speed: "instant", seed: 9 }), "order");
    const b = await collect(new MockModel({ speed: "instant", seed: 9 }), "order");
    expect(a.chunks).toEqual(b.chunks);
  });

  it("replays a failure variant", async () => {
    const { text } = await collect(new MockModel({ speed: "instant" }), "demo: unknown tool");
    expect(text).toBe(fixture("variants/unknown-tool.omni"));
  });

  it("'demo: cut off' stops partway through a line with stopReason max_tokens", async () => {
    const { text, result } = await collect(new MockModel({ speed: "instant" }), "demo: cut off");
    const full = fixture("payment-confirmation.omni");
    expect(full.startsWith(text)).toBe(true);
    expect(text.length).toBeLessThan(full.length);
    expect(text.endsWith("\n")).toBe(false);
    expect(result.stopReason).toBe("max_tokens");
  });

  it("'demo: model error' sends some text, then rejects with a retryable ModelError", async () => {
    const chunks: string[] = [];
    const run = new MockModel({ speed: "instant" }).generate("demo: model error", {
      signal: new AbortController().signal,
      onText: (t) => chunks.push(t),
    });
    await expect(run).rejects.toMatchObject({ name: "ModelError", code: "model_error", retryable: true });
    expect(chunks.join("").length).toBeGreaterThan(0);
  });

  it("finishes quickly at instant speed", async () => {
    const started = performance.now();
    await collect(new MockModel({ speed: "instant" }), "payment");
    expect(performance.now() - started).toBeLessThan(100);
  });

  it("pauses like a model before the first text at realistic speed", async () => {
    // Measures only the first chunk, then cancels: a full realistic stream takes seconds, which made
    // this test time out under the load of the full suite.
    const controller = new AbortController();
    const started = performance.now();
    let firstAt = 0;
    const run = new MockModel({ speed: "realistic", seed: 2 }).generate("sign in", {
      signal: controller.signal,
      onText: () => {
        firstAt ||= performance.now() - started;
        controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    expect(firstAt).toBeGreaterThan(300);
  });
});

describe("MockModel abort", () => {
  it("stops within 100 ms of abort and sends nothing afterwards", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    let chunksAtAbort = -1;
    let abortedAt = 0;
    const run = new MockModel({ speed: "realistic", seed: 5 }).generate("payment", {
      signal: controller.signal,
      onText: (t) => {
        chunks.push(t);
        if (chunks.length === 2) {
          chunksAtAbort = chunks.length;
          abortedAt = performance.now();
          controller.abort();
        }
      },
    });
    await expect(run).rejects.toBeInstanceOf(ModelError);
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    expect(performance.now() - abortedAt).toBeLessThan(100);
    await new Promise((r) => setTimeout(r, 150));
    expect(chunks.length).toBe(chunksAtAbort);
  });

  it("rejects at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const onText = vi.fn();
    await expect(new MockModel({ speed: "realistic" }).generate("payment", { signal: controller.signal, onText })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(onText).not.toHaveBeenCalled();
  });
});
