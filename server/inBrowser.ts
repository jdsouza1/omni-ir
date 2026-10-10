// The Omni-IR API without a server, for the hosted playground: a `fetch` that answers
// GET /api/health, POST /api/generate (as Server-Sent Events), GET /api/live (a screen's updates) and
// POST /api/mutate inside the browser, with the same rules as the Express app (api.ts). Pass it to the playground, or to
// generate() and createMutationHandler(), as their `fetch`. Imports nothing from Node.
//
// What it leaves out, because the browser is the visitor's own: rate limits, the generation
// timeout, CORS and logging. It runs only the free FixtureModel in the hosted playground.
//
// Actions run against an in-memory store with the demo data, as one pretend demo visitor
// (PLAN-BACKEND.md decision 7): the same rules as the server, nothing leaving the browser.
import { createParser, type ToolRegistry } from "@omni-ir/core";
import { TOOLS } from "../app/tools";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { ACTION_UPDATES, LIVE_FEEDS, type LiveFeed } from "../app/live";
import { describeIssues, errorBody, GenerateBody, generateError, INVALID_JSON, MARKER_CHUNK, MutateBody, runMutation, sseEvent, versionError, type ActionUpdate } from "./api";
import { createLiveScreens, type LiveScreens } from "./live";
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
  /** What the app keeps current on its screens (Step 22); defaults to the demo's. */
  feeds?: readonly LiveFeed[];
  /** The update each tool's result carries ([10.35]); defaults to the demo's. */
  actionUpdates?: Readonly<Record<string, ActionUpdate>>;
  /** Runs a feed's next step later; injectable for tests. */
  schedule?: (fn: () => void, ms: number) => () => void;
}

// The Express app's body limit (express.json({ limit: "16kb" })).
const MAX_BODY_BYTES = 16 * 1024;

export function createInBrowserApi({
  model,
  tools = TOOLS,
  handlers = HANDLERS,
  store: givenStore,
  feeds = LIVE_FEEDS,
  actionUpdates = ACTION_UPDATES,
  schedule,
}: InBrowserApiOptions): typeof globalThis.fetch {
  const store = givenStore ?? createMemoryStore();
  // The visitor's own screens, kept current in their browser; one pretend visitor, so no owner.
  const live = createLiveScreens({ feeds, ...(schedule ? { schedule } : {}) });
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
    if (method === "GET" && path === "/api/live") return liveResponse(live, searchParams, init.signal ?? undefined);
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
        { tool: parsed.data.tool, params: parsed.data.params, user, idempotencyKey, button: parsed.data.button },
        { tools, handlers, ctx: { store, mailer, now: Date.now(), publicUrl: "https://example.invalid" }, updates: actionUpdates },
      );
      return json(answer.status, answer.body);
    }

    const parsed = GenerateBody.safeParse(body);
    if (!parsed.success) return json(400, errorBody("invalid_request", describeIssues(parsed.error)));
    const refused = versionError(searchParams.get("version"));
    if (refused) return json(400, refused);
    return generateResponse(model, parsed.data.prompt, init.signal ?? undefined, (text) => {
      // The server's copy of the screen, to follow it and check its updates ([10.36], [10.38]).
      const parser = createParser({ tools, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
      parser.write(text);
      parser.end();
      return live.open(parser, null);
    });
  };
}

/** A screen's updates as Server-Sent Events ([10.37]): what was missed, each new one, then end. */
function liveResponse(live: LiveScreens, query: URLSearchParams, signal: AbortSignal | undefined): Response {
  const screen = query.get("screen") ?? "";
  const after = /^\d{1,15}$/.test(query.get("after") ?? "0") ? Number(query.get("after") ?? "0") : -1;
  if (screen === "" || after < 0) return json(400, errorBody("invalid_request", "Follow a screen with ?screen=…&after=N."));
  const encoder = new TextEncoder();
  let stop: (() => void) | null = null;
  let out: ReadableStreamDefaultController<Uint8Array> | null = null;
  const early: Uint8Array[] = [];
  let ended = false;
  const send = (frame: string) => (out ? out.enqueue(encoder.encode(frame)) : early.push(encoder.encode(frame)));
  stop = live.follow(screen, null, after, {
    update: (seq, text) => send(sseEvent("update", { seq, text })),
    end: () => {
      send(sseEvent("end", {}));
      ended = true;
      out?.close();
    },
  });
  if (stop === null) return json(404, errorBody("not_found", "That screen isn't followed here."));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      out = controller;
      for (const frame of early) controller.enqueue(frame);
      if (ended) return controller.close();
      signal?.addEventListener("abort", () => {
        stop?.();
        controller.error(new DOMException("The request was cancelled.", "AbortError"));
      }, { once: true });
    },
    cancel() {
      stop?.();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}

/** The model's text as a Server-Sent Events response: chunk events, then done or error. */
function generateResponse(model: Model, prompt: string, signal: AbortSignal | undefined, follow: (text: string) => string | null): Response {
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
        let text = MARKER_CHUNK;
        const result = await model.generate(prompt, {
          signal: controller.signal,
          onText: (chunk) => {
            text += chunk;
            send("chunk", { text: chunk });
          },
        });
        const screen = follow(text);
        if (screen !== null) send("live", { screen });
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
