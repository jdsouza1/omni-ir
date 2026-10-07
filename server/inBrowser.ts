// The Omni-IR API without a server, for the hosted playground: a `fetch` that answers
// GET /api/health, POST /api/generate (as Server-Sent Events) and POST /api/mutate inside the
// browser, with the same rules as the Express app (api.ts). Pass it to the playground, or to
// generate() and createMutationHandler(), as their `fetch`. Imports nothing from Node.
//
// What it leaves out, because the browser is the visitor's own: rate limits, the generation
// timeout, CORS and logging. It runs only the free FixtureModel in the hosted playground.
//
// Actions run against an in-memory store with the demo data, as one pretend demo visitor
// (PLAN-BACKEND.md decision 7): the same rules as the server, nothing leaving the browser.
import type { ToolRegistry } from "@omni-ir/core";
import { TOOLS } from "../app/tools";
import { describeIssues, errorBody, GenerateBody, generateError, INVALID_JSON, MARKER_CHUNK, MutateBody, runMutation, sseEvent, versionError } from "./api";
import { ModelError, type Model } from "./models/types";
import { createDevMailer } from "./backend/auth";
import { createMemoryStore } from "./backend/memoryStore";
import { DEMO_VISITOR_EMAIL, seedDemo } from "./backend/seed";
import type { Store } from "./backend/types";
import { HANDLERS, type ToolHandler } from "./tools/handlers";

export interface InBrowserApiOptions {
  model: Model;
  /** Tools it will run; defaults to the shared registry. */
  tools?: ToolRegistry;
  /** Handler per tool; defaults to the reference handlers. */
  handlers?: Readonly<Record<string, ToolHandler>>;
  /** Where actions keep their data; defaults to memory with the demo data. */
  store?: Store;
}

// The Express app's body limit (express.json({ limit: "16kb" })).
const MAX_BODY_BYTES = 16 * 1024;

export function createInBrowserApi({ model, tools = TOOLS, handlers = HANDLERS, store: givenStore }: InBrowserApiOptions): typeof globalThis.fetch {
  const store = givenStore ?? createMemoryStore();
  const ready = givenStore ? Promise.resolve() : seedDemo(store);
  const mailer = createDevMailer();
  return async (input, init = {}) => {
    // Like fetch: a request cancelled before it is answered rejects.
    if (init.signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { pathname: path, searchParams } = new URL(url, "http://in-browser");
    const method = (init.method ?? "GET").toUpperCase();

    if (method === "GET" && path === "/api/health") return json(200, { ok: true, model: model.kind, auth: "demo", modelCheck: { mode: "off" } });
    if (method === "GET" && path === "/api/auth/me") return json(200, { user: { email: DEMO_VISITOR_EMAIL }, demo: true });
    if (method !== "POST" || (path !== "/api/generate" && path !== "/api/mutate")) return json(404, errorBody("not_found", "Not found."));

    const raw = typeof init.body === "string" ? init.body : "";
    let body: unknown;
    try {
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error("too large");
      body = JSON.parse(raw);
    } catch {
      return json(400, INVALID_JSON);
    }

    if (path === "/api/mutate") {
      const parsed = MutateBody.safeParse(body);
      if (!parsed.success) return json(400, errorBody("invalid_request", describeIssues(parsed.error)));
      await ready;
      const user = await store.users.ensure(DEMO_VISITOR_EMAIL);
      const idempotencyKey = new Headers(init.headers).get("idempotency-key");
      const answer = await runMutation(
        { tool: parsed.data.tool, params: parsed.data.params, user, idempotencyKey },
        { tools, handlers, ctx: { store, mailer, now: Date.now(), publicUrl: "https://example.invalid" } },
      );
      return json(answer.status, answer.body);
    }

    const parsed = GenerateBody.safeParse(body);
    if (!parsed.success) return json(400, errorBody("invalid_request", describeIssues(parsed.error)));
    const refused = versionError(searchParams.get("version"));
    if (refused) return json(400, refused);
    return generateResponse(model, parsed.data.prompt, init.signal ?? undefined);
  };
}

/** The model's text as a Server-Sent Events response: chunk events, then done or error. */
function generateResponse(model: Model, prompt: string, signal: AbortSignal | undefined): Response {
  const started = performance.now();
  const controller = new AbortController();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(out) {
      const send = (event: string, data: unknown) => {
        if (!controller.signal.aborted) out.enqueue(encoder.encode(sseEvent(event, data)));
      };
      const onAbort = () => {
        controller.abort();
        out.error(new DOMException("The request was cancelled.", "AbortError"));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      send("chunk", { text: MARKER_CHUNK });
      try {
        const result = await model.generate(prompt, { signal: controller.signal, onText: (text) => send("chunk", { text }) });
        send("done", { stopReason: result.stopReason, model: result.model, ms: Math.round(performance.now() - started) });
      } catch (err) {
        if (controller.signal.aborted && err instanceof ModelError && err.code === "aborted") return;
        send("error", generateError(err));
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
      if (!controller.signal.aborted) out.close();
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
