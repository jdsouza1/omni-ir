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

async function run(prompt: string, parser: ReturnType<typeof createParser>, init: { signal?: AbortSignal; fetch?: typeof fetch; idleTimeoutMs?: number } = {}) {
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

  it("asks for its format, and retries once without a version when a server refuses it [10.12]", async () => {
    const h = setup();
    const urls: string[] = [];
    const answers = [
      () => new Response(JSON.stringify({ error: { code: "unsupported_version", message: "This server writes Omni-IR 0.7.", retryable: false } }), { status: 400 }),
      () => new Response('event: chunk\ndata: {"text":"# omni-ir 0.7\\nroot = Divider()\\n"}\n\nevent: done\ndata: {"stopReason":"end_turn","model":"old","ms":1}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } }),
    ];
    const oldServer: typeof fetch = async (input) => {
      urls.push(String(input));
      return answers.shift()!();
    };
    const outcome = await run("x", h.parser, { fetch: oldServer });
    expect(new URL(urls[0]!, "http://x").searchParams.get("version")).toBe("0.8");
    expect(new URL(urls[1]!, "http://x").searchParams.has("version")).toBe(false);
    expect(outcome).toMatchObject({ status: "done" });
    // A 0.7 server's marker means format 0.5: no update notice.
    expect(h.parser.getSnapshot().newerVersion).toBe(false);
    expect(h.parser.getSnapshot().nodes.has("root")).toBe(true);
  });

  it("retries only once: a second refusal is reported", async () => {
    const h = setup();
    let calls = 0;
    const refusing: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: "unsupported_version", message: "No.", retryable: false } }), { status: 400 });
    };
    const outcome = await run("x", h.parser, { fetch: refusing });
    expect(calls).toBe(2);
    expect(outcome).toMatchObject({ status: "error", code: "unsupported_version" });
  });

  it("reports connection_lost when no bytes arrive for the idle timeout, and closes the response [10.10]", async () => {
    const h = setup();
    let cancelled = false;
    const stalled: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: chunk\ndata: {"text":"root = Divider()\\n"}\n\n'));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    const outcome = await run("x", h.parser, { fetch: stalled, idleTimeoutMs: 50 });
    expect(outcome).toMatchObject({ status: "error", code: "connection_lost", retryable: true });
    expect(h.parser.getSnapshot().nodes.has("root")).toBe(true);
    expect(h.parser.getSnapshot().complete).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("keeps waiting while pings arrive more often than the idle timeout [10.10]", async () => {
    const h = setup();
    const encoder = new TextEncoder();
    const pinging: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            for (let i = 0; i < 6; i++) {
              controller.enqueue(encoder.encode(": ping\n\n"));
              await new Promise((r) => setTimeout(r, 20));
            }
            controller.enqueue(encoder.encode('event: chunk\ndata: {"text":"root = Divider()\\n"}\n\nevent: done\ndata: {"stopReason":"end_turn","model":"fake","ms":1}\n\n'));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    const outcome = await run("x", h.parser, { fetch: pinging, idleTimeoutMs: 60 });
    expect(outcome).toMatchObject({ status: "done" });
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
  it("Pay → /api/mutate → receipt from the fake ledger, with the typed note", async () => {
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
    expect(results[0]).toMatchObject({ status: "confirmed", amount: 42.5 });
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
