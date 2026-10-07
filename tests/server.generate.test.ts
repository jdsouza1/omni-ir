import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MockModel } from "../server/models/mock";
import { ModelError } from "../server/models/types";
import { MARKER_CHUNK } from "../server/api";
import { FakeModel, readSse, startServer, textOf, waitForAbort } from "./serverHelpers";

const fixture = (name: string) => readFileSync(resolve("fixtures", name), "utf8");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/generate with the mock model", () => {
  it("streams the screen as SSE chunks and ends with done", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant", seed: 4 }) });
    const response = await server.generate({ prompt: "a payment confirmation" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(response.headers.get("cache-control")).toContain("no-cache");

    const { events } = await readSse(response);
    expect(textOf(events)).toBe(MARKER_CHUNK + fixture("payment-confirmation.omni"));
    const done = events.at(-1)!;
    expect(done.event).toBe("done");
    expect(done.data).toMatchObject({ stopReason: "end_turn", model: "mock" });
    expect(typeof (done.data as { ms: number }).ms).toBe("number");
  });

  it("reports a cut-off response as done with stopReason max_tokens", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const { events } = await readSse(await server.generate({ prompt: "demo: cut off" }));
    expect(events.at(-1)).toMatchObject({ event: "done", data: { stopReason: "max_tokens" } });
  });

  it("sends an error event after partial text when the model fails", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const { events } = await readSse(await server.generate({ prompt: "demo: model error" }));
    expect(textOf(events).length).toBeGreaterThan(0);
    expect(events.at(-1)).toEqual({
      event: "error",
      data: { code: "model_error", message: "The mock model failed partway through (demo).", retryable: true },
    });
  });
});

describe("POST /api/generate: SSE framing", () => {
  it("delivers newlines, quotes, CRLF and multi-byte characters exactly", async () => {
    const pieces = ["a = Text(\"x\")\n", "\"quoted\"", "\r\n", "Café ☕ 🧾", "\\n literal", "\n\n", "data: not a field\n"];
    const model = new FakeModel(async ({ onText }) => {
      for (const p of pieces) onText(p);
      return { stopReason: "end_turn", model: "fake" };
    });
    server = await startServer({ model });
    const { events } = await readSse(await server.generate({ prompt: "x" }));
    expect(textOf(events)).toBe(MARKER_CHUNK + pieces.join(""));
    expect(events.filter((e) => e.event === "chunk")).toHaveLength(pieces.length + 1);
  });

  it("sends heartbeat comments while the model has produced nothing yet [10.10]", async () => {
    const model = new FakeModel(async ({ onText }) => {
      await sleep(120);
      onText("root = Divider()\n");
      return { stopReason: "end_turn", model: "fake" };
    });
    server = await startServer({ model, heartbeatMs: 20 });
    const { comments } = await readSse(await server.generate({ prompt: "x" }));
    expect(comments.filter((c) => c === "ping").length).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/generate: errors, timeout and abort", () => {
  it("never leaks an unexpected error's message", async () => {
    const model = new FakeModel(async () => {
      throw new Error("db password=hunter2 at internal.ts:42");
    });
    server = await startServer({ model });
    const { events, raw } = await readSse(await server.generate({ prompt: "x" }));
    expect(raw).not.toContain("hunter2");
    expect(events.at(-1)).toEqual({ event: "error", data: { code: "model_error", message: "Generation failed.", retryable: true } });
    expect(server.logs.some((l) => l.error === "db password=hunter2 at internal.ts:42")).toBe(true);
  });

  it("passes ModelError codes through (e.g. rate_limited)", async () => {
    const model = new FakeModel(async () => {
      throw new ModelError("rate_limited", "The model is busy; try again shortly.", true);
    });
    server = await startServer({ model });
    const { events } = await readSse(await server.generate({ prompt: "x" }));
    expect(events.at(-1)).toEqual({
      event: "error",
      data: { code: "rate_limited", message: "The model is busy; try again shortly.", retryable: true },
    });
  });

  it("times out a slow model: aborts it and sends error timeout", async () => {
    const model = new FakeModel(({ signal }) => waitForAbort(signal));
    server = await startServer({ model, config: { timeoutMs: 60 } });
    const { events } = await readSse(await server.generate({ prompt: "x" }));
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "timeout", retryable: true } });
    expect(model.lastSignal?.aborted).toBe(true);
  });

  it("aborts the model within 100 ms when the client disconnects", async () => {
    const model = new FakeModel(async ({ signal, onText }) => {
      onText("root = Card([a])\n");
      await waitForAbort(signal);
      throw new Error("unreachable");
    });
    server = await startServer({ model });
    const client = new AbortController();
    const response = await server.generate({ prompt: "x" }, { signal: client.signal });
    const reader = response.body!.getReader();
    await reader.read(); // first bytes arrived
    const disconnectedAt = performance.now();
    client.abort();
    for (let i = 0; i < 20 && model.abortedAt === null; i++) await sleep(10);
    expect(model.abortedAt).not.toBeNull();
    expect(model.abortedAt! - disconnectedAt).toBeLessThan(100);
  });
});

describe("POST /api/generate: request validation and limits", () => {
  it.each([
    ["missing prompt", {}],
    ["empty prompt", { prompt: "   " }],
    ["prompt too long", { prompt: "x".repeat(2001) }],
    ["wrong type", { prompt: 42 }],
    ["unknown field", { prompt: "hi", model: "claude-opus-5-5" }],
    ["malformed JSON", "{ not json"],
  ])("%s → 400 invalid_request, model not called", async (_, body) => {
    const model = new FakeModel(async () => ({ stopReason: "end_turn", model: "fake" }));
    server = await startServer({ model });
    const response = await server.generate(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(model.calls).toBe(0);
  });

  it("rate limits per IP and sends Retry-After", async () => {
    let clock = 1_000_000;
    const model = new FakeModel(async () => ({ stopReason: "end_turn", model: "fake" }));
    server = await startServer({ model, config: { rateLimitPerMinute: 2 }, now: () => clock });
    expect((await server.generate({ prompt: "a" })).status).toBe(200);
    expect((await server.generate({ prompt: "b" })).status).toBe(200);
    const limited = await server.generate({ prompt: "c" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ error: { code: "rate_limited", retryable: true } });
    expect(model.calls).toBe(2);

    clock += 61_000; // the window has passed
    expect((await server.generate({ prompt: "d" })).status).toBe(200);
  });

  it("logs a parse-quality summary of what the model wrote, without changing the stream", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const clean = await readSse(await server.generate({ prompt: "a payment confirmation" }));
    const bad = await readSse(await server.generate({ prompt: "demo: unknown tool" }));
    expect(textOf(bad.events)).toBe(MARKER_CHUNK + fixture("variants/unknown-tool.omni")); // forwarded unchanged

    const [first, second] = server.logs.filter((l) => l.event === "generate");
    expect(first!.parse).toEqual({ errors: {}, warnings: {}, components: 10 });
    expect(second!.parse).toMatchObject({ errors: { unknown_tool: 1, ungoverned_mutation: 1 } });
    expect(textOf(clean.events)).toBe(MARKER_CHUNK + fixture("payment-confirmation.omni"));
  });

  it("never logs prompt text", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    await readSse(await server.generate({ prompt: "my secret project codename ZEBRA" }));
    expect(JSON.stringify(server.logs)).not.toContain("ZEBRA");
    expect(server.logs.some((l) => l.event === "generate")).toBe(true);
  });
});

describe("other routes", () => {
  it("GET /api/health reports the model kind", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const response = await fetch(`${server.url}/api/health`);
    expect(await response.json()).toEqual({ ok: true, model: "mock", auth: "demo", modelCheck: { mode: "off" } });
  });

  it("unknown routes return a JSON 404", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const response = await fetch(`${server.url}/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("allows CORS only for the configured origin", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }), config: { corsOrigin: "http://localhost:5173" } });
    const preflight = (origin: string) =>
      fetch(`${server!.url}/api/generate`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      });
    const allowed = await preflight("http://localhost:5173");
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const denied = await preflight("https://evil.example");
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
