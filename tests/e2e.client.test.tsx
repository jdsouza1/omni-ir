// @vitest-environment jsdom
// Task E: browser helpers → real Express server → MockModel → parser → renderer, all in-process.
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TOOLS } from "../app/tools";
import { generate, type GenerateOutcome } from "@omni-ir/react";
import { createMutationHandler } from "@omni-ir/react";
import { createParser, type ParserEvent } from "@omni-ir/core";
import { MockModel } from "../server/models/mock";
import type { MutationCall } from "@omni-ir/react";
import { FakeModel, startServer, waitForAbort } from "./serverHelpers";
import { renderOmni } from "./renderHelpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  cleanup();
  await server?.close();
  server = null;
});

function setup(onMutation?: (call: MutationCall) => void | Promise<void>) {
  const parser = createParser({ tools: TOOLS });
  const parserEvents: ParserEvent[] = [];
  parser.subscribe((e) => parserEvents.push(e));
  const h = renderOmni({ parser, ...(onMutation ? { onMutation } : {}) });
  return { ...h, parser, parserEvents };
}

async function run(prompt: string, parser: ReturnType<typeof createParser>, init: { signal?: AbortSignal; fetch?: typeof fetch } = {}) {
  let outcome!: GenerateOutcome;
  await act(async () => {
    outcome = await generate(prompt, { parser, baseUrl: server?.url ?? "http://127.0.0.1:1", ...init });
  });
  return outcome;
}

describe("generate(): streaming a screen from the server", () => {
  it("renders the streamed screen and reports done", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant", seed: 2 }) });
    const h = setup();
    const outcome = await run("where is my order?", h.parser);
    expect(outcome).toMatchObject({ status: "done", stopReason: "end_turn", model: "mock" });
    expect(screen.getByRole("heading", { name: "Order #A1B2-7731" })).toBeTruthy();
    expect(h.container.querySelector("[data-pending-id]")).toBeNull();
    expect(h.parser.getSnapshot().complete).toBe(true);
    // It really streamed: children were pending before they arrived.
    expect(h.parserEvents.some((e) => e.type === "pending")).toBe(true);
    expect(h.parserEvents.filter((e) => e.type === "error")).toEqual([]);
  });

  it("shows fallbacks for the missing part of a cut-off response", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const h = setup();
    const outcome = await run("demo: cut off", h.parser);
    expect(outcome).toMatchObject({ status: "done", stopReason: "max_tokens" });
    expect(h.container.querySelectorAll('[data-fallback-reason="missing"]').length).toBeGreaterThan(0);
    expect(screen.getByText("Confirm payment")).toBeTruthy(); // what arrived is kept
  });

  it("ends the parser and returns the error when the model fails mid-stream", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const h = setup();
    const outcome = await run("demo: model error", h.parser);
    expect(outcome).toEqual({ status: "error", code: "model_error", message: "The mock model failed partway through (demo).", retryable: true });
    expect(h.parser.getSnapshot().complete).toBe(true);
    expect(screen.getByText("Confirm payment")).toBeTruthy();
  });

  it("returns a request error without touching the parser", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const h = setup();
    const outcome = await run("   ", h.parser);
    expect(outcome).toMatchObject({ status: "error", code: "invalid_request", retryable: false });
    expect(h.parser.getSnapshot().complete).toBe(false);
  });

  it("returns rate_limited as retryable", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }), config: { rateLimitPerMinute: 1 } });
    await run("order", createParser({ tools: TOOLS }));
    const outcome = await run("order", createParser({ tools: TOOLS }));
    expect(outcome).toMatchObject({ status: "error", code: "rate_limited", retryable: true });
  });

  it("Cancel aborts both the browser request and the model on the server", async () => {
    const model = new FakeModel(async ({ signal, onText }) => {
      onText("root = Card([title, body])\ntitle = Heading(\"Partial\")\n");
      await waitForAbort(signal);
      throw new Error("unreachable");
    });
    server = await startServer({ model });
    const h = setup();
    const cancel = new AbortController();
    h.parser.subscribe((e) => {
      if (e.type === "node" && e.id === "title") cancel.abort();
    });
    const outcome = await run("x", h.parser, { signal: cancel.signal });
    expect(outcome).toEqual({ status: "aborted" });
    for (let i = 0; i < 20 && model.abortedAt === null; i++) await new Promise((r) => setTimeout(r, 10));
    expect(model.abortedAt).not.toBeNull();
    // The parser is ended, so what never arrived shows as a fallback rather than loading forever.
    expect(h.parser.getSnapshot().complete).toBe(true);
    expect(h.container.querySelector('[data-fallback-reason="missing"]')?.getAttribute("data-node-id")).toBe("body");
  });

  it("reports connection_lost when the stream ends without done or error", async () => {
    const h = setup();
    const truncated: typeof fetch = async () =>
      new Response('event: chunk\ndata: {"text":"root = Divider()\\n"}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    const outcome = await run("x", h.parser, { fetch: truncated });
    expect(outcome).toMatchObject({ status: "error", code: "connection_lost", retryable: true });
    expect(h.parser.getSnapshot().nodes.has("root")).toBe(true);
    expect(h.parser.getSnapshot().complete).toBe(true);
  });

  it("parses SSE events split across network reads, including CRLF framing", async () => {
    const h = setup();
    const body = 'event: chunk\r\ndata: {"text":"root = Text(\\"Café ☕\\")\\n"}\r\n\r\nevent: done\r\ndata: {"stopReason":"end_turn","model":"fake","ms":1}\r\n\r\n';
    const bytes = new TextEncoder().encode(body);
    const splitFetch: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    const outcome = await run("x", h.parser, { fetch: splitFetch });
    expect(outcome).toMatchObject({ status: "done" });
    expect(screen.getByText("Café ☕")).toBeTruthy();
  });

  it("returns network_error when the server can't be reached", async () => {
    const h = setup();
    const down: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const outcome = await run("x", h.parser, { fetch: down });
    expect(outcome).toMatchObject({ status: "error", code: "network_error", retryable: true });
  });
});

describe("createMutationHandler(): governed actions reach the server", () => {
  it("Pay → /api/mutate → stub receipt, with the typed note", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const results: Record<string, unknown>[] = [];
    const onMutation = createMutationHandler({ baseUrl: server.url, onResult: (_call, result) => results.push(result) });
    const h = setup(onMutation);
    await run("a payment confirmation", h.parser);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Note for merchant (optional)"), "Table 4");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Pay now" }));
    });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(results[0]).toMatchObject({ stub: true, status: "confirmed", amount: 42.5 });
    expect(results[0]!.receiptId).toMatch(/^rcpt_/);
    expect(h.errors()).toEqual([]);
  });

  it("turns a server rejection into a renderer error event", async () => {
    // The server's registry lacks the tool the browser allows: the server must win.
    server = await startServer({ model: new MockModel({ speed: "instant" }), tools: {} });
    const onMutation = createMutationHandler({ baseUrl: server.url });
    const h = setup(onMutation);
    await run("a payment confirmation", h.parser);

    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Pay now" }));
    });
    await vi.waitFor(() => expect(h.errors()).toEqual(["handler_failed"]));
    const issue = h.events.find((e) => e.type === "error");
    expect(issue).toMatchObject({ issue: { message: expect.stringContaining("not a permitted action") } });
  });
});
