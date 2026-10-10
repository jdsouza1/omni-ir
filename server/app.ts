// Express app for Omni-IR. POST /api/generate streams the model's Omni-IR text to the browser as
// Server-Sent Events. The server relays text and never trusts it: validation happens in the
// browser's parser and schema, the trusted zone.
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ASSETS, type AssetRegistry } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { createParser } from "@omni-ir/core";
import { AgUiEncoder } from "@omni-ir/core/ag-ui";
import type { AppComponents, PicturePattern, ToolRegistry } from "@omni-ir/core";
import type { ServerConfig } from "./config";
import { AgUiRunInput, describeIssues, errorBody, GenerateBody, generateError, INVALID_JSON, MARKER_CHUNK, MutateBody, promptOf, runMutation, sseEvent, versionError } from "./api";
import { ModelError, type Model } from "./models/types";
import { clearedCookie, createDevMailer, credentialsOf, endSession, redeemLink, SESSION_TTL_MS, sessionCookie, userOfSession, type Mailer } from "./backend/auth";
import { createMemoryStore } from "./backend/memoryStore";
import { DEMO_VISITOR_EMAIL, seedDemo } from "./backend/seed";
import type { Store, User } from "./backend/types";
import { HANDLERS, type ToolHandler } from "./tools/handlers";
import type { Challenge } from "../app/challenges";
import { createModelGate, setupFingerprint } from "./modelCheck";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { loadView, referenceMcp } from "./mcp";

export interface AppOptions {
  config: ServerConfig;
  model: Model;
  /** Tools the server will run; defaults to the shared registry. */
  tools?: ToolRegistry;
  /** Image assets streams may name; defaults to the shared registry. */
  assets?: AssetRegistry;
  /** The app's own components (Step 20); defaults to the demo app's. */
  components?: AppComponents;
  /** Families of picture names the app looks up (Step 20); defaults to the demo app's. */
  pictures?: readonly PicturePattern[];
  /** Handler per tool, with its access rule; defaults to the reference handlers. */
  handlers?: Readonly<Record<string, ToolHandler>>;
  /** Where data lives; defaults to a SQLite file (OMNI_DB) or memory, with the demo data added. */
  store?: Store;
  /** Sends sign-in links; defaults to the development outbox, which prints them to the log. */
  mailer?: Mailer;
  /**
   * Who is asking: replace the reference sign-in with your own (an existing session, an identity
   * provider). Return null for nobody. Requests from a browser must still pass the Origin check.
   */
  authenticate?: (req: Request) => Promise<User | null>;
  /** Heartbeat interval for SSE streams (default 15 s). */
  heartbeatMs?: number;
  /** Structured log sink; never receives prompt text. */
  log?: (entry: Record<string, unknown>) => void;
  /** Clock, injectable for rate-limit tests. */
  now?: () => number;
  /** The model check's challenge pool and random source (PLAN-MODELCHECK.md); defaults to app/challenges.ts. */
  modelCheck?: { pool?: readonly Challenge[]; random?: () => number };
  /** The MCP view's HTML (PLAN-MCPAPPS.md); defaults to packages/mcp/dist/view.html when OMNI_MCP is on. */
  mcpView?: string;
}

const RATE_WINDOW_MS = 60_000;

/** How one route writes a generation's stream: each hook gets `send`, which writes one frame. */
interface StreamOutput {
  /** The log entry's event name. */
  route: string;
  start(send: (frame: string) => void): void;
  text(send: (frame: string) => void, text: string): void;
  done(send: (frame: string) => void, done: { stopReason: string; model: string; ms: number }): void;
  error(send: (frame: string) => void, error: { code: string; message: string; retryable: boolean }): void;
}

export function createApp({
  config,
  model,
  tools = TOOLS,
  assets = ASSETS,
  components = APP_COMPONENTS,
  pictures = PICTURES,
  handlers = HANDLERS,
  store: givenStore,
  mailer = createDevMailer((line) => console.log(line)),
  authenticate,
  heartbeatMs = 15_000,
  log = defaultLog,
  now = Date.now,
  modelCheck: challengeOptions = {},
  mcpView,
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  // Read the client's address from X-Forwarded-For only when a trusted proxy wrote it ([10.15]).
  app.set("trust proxy", config.trustProxy);
  app.use(cors(config.corsOrigin));
  // A screen sent over MCP can be long (show_screen takes up to 200,000 characters); everything else is small.
  const smallJson = express.json({ limit: "16kb" });
  const mcpJson = express.json({ limit: "1mb" });
  app.use((req, res, next) => (req.path === "/mcp" && config.mcp ? mcpJson : smallJson)(req, res, next));

  // The SQLite store is loaded only when OMNI_DB asks for it, so node:sqlite is never imported
  // where it isn't used (bundlers and test environments that don't know it). Every route that
  // reads the store waits for `ready` first.
  let store: Store = givenStore ?? createMemoryStore();
  const ready = givenStore
    ? Promise.resolve()
    : (async () => {
        if (config.dbPath) store = (await import("./backend/sqliteStore")).createSqliteStore(config.dbPath);
        await seedDemo(store);
      })();
  /** Close the store this app opened (not one it was given): call when the server stops. */
  app.locals.closeStore = async () => {
    await ready;
    if (!givenStore) store.close?.();
  };
  // The model check ([10.21]): a challenge for this setup, recorded in the store once it is ready.
  const gate = createModelGate({
    mode: config.modelCheck,
    model,
    fingerprint: setupFingerprint({ model: model.setup?.id ?? model.kind, systemPrompt: model.setup?.systemPrompt ?? "", settings: model.setup?.settings, tools, assets, components, pictures }),
    store: {
      modelChecks: {
        add: async (record) => (await ready, store.modelChecks.add(record)),
        latestPass: async (fingerprint, since) => (await ready, store.modelChecks.latestPass(fingerprint, since)),
        list: async () => (await ready, store.modelChecks.list()),
      },
    },
    tools,
    assets,
    components,
    pictures,
    ...challengeOptions,
    timeoutMs: config.timeoutMs,
    now,
    log,
  });
  app.locals.modelCheck = gate;
  const mcp = config.mcp
    ? referenceMcp({
        // No app components here: the built-in view has no code to draw them (an app passes its own view).
        tools,
        assets,
        handlers,
        context: () => ({ store, mailer, now: now(), publicUrl: config.publicUrl }),
        viewHtml: mcpView ?? loadView(),
        log,
      })
    : null;
  const secure = config.publicUrl.startsWith("https:");
  /** Origins a browser may send actions from: the app's own and the one CORS allows. */
  const allowedOrigins = new Set([config.corsOrigin, new URL(config.publicUrl).origin]);

  /**
   * Who is asking, and how they proved it. A cookie is sent by the browser automatically, even on a
   * request another site starts, so cookie-authenticated requests must come from an allowed Origin.
   */
  async function identify(req: Request): Promise<{ user: User | null; via: "cookie" | "bearer" | "app" | "demo" | null }> {
    await ready;
    if (authenticate) return { user: await authenticate(req), via: "app" };
    if (config.auth === "demo") return { user: await store.users.ensure(DEMO_VISITOR_EMAIL), via: "demo" };
    const credentials = credentialsOf({ authorization: req.get("authorization"), cookie: req.get("cookie") });
    if (credentials.token === null) return { user: null, via: null };
    const user = await userOfSession(store, credentials.token, now());
    return { user, via: user ? credentials.via : null };
  }

  /** A browser request from another site is refused; a cookie-authenticated one must name an allowed Origin. */
  function badOrigin(req: Request, via: string | null): boolean {
    const origin = req.get("origin");
    if (origin !== undefined) return !allowedOrigins.has(origin);
    return via === "cookie";
  }

  const allow = rateLimiter(config.rateLimitPerMinute, now);
  // Mutations are cheap for the server but may hit real services later; allow more, still bounded.
  const allowMutate = rateLimiter(config.rateLimitPerMinute * 3, now);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: model.kind, auth: config.auth, modelCheck: gate.status(), ...(mcp ? { mcp: mcp.counts } : {}) });
  });

  /** The version a client asked for ([10.1]): null when none, "" when the query isn't one string. */
  const requestedVersion = (req: Request) =>
    typeof req.query.version === "string" ? req.query.version : req.query.version === undefined ? null : "";

  app.post("/api/generate", async (req, res) => {
    const body = GenerateBody.safeParse(req.body);
    if (!body.success) {
      return sendError(res, 400, "invalid_request", describeIssues(body.error));
    }
    const refused = versionError(requestedVersion(req));
    if (refused) return res.status(400).json(refused);
    await stream(req, res, body.data.prompt, {
      route: "generate",
      start: (send) => send(sseEvent("chunk", { text: MARKER_CHUNK })),
      text: (send, text) => send(sseEvent("chunk", { text })),
      done: (send, done) => send(sseEvent("done", done)),
      error: (send, error) => send(sseEvent("error", error)),
    });
  });

  // The same screen over AG-UI 1.0 ([10.18]): AG-UI's run input in, AG-UI events out, each event one
  // `data:` field. Only the screen travels here; governed actions still go to /api/mutate ([10.20]).
  app.post("/api/ag-ui", async (req, res) => {
    const input = AgUiRunInput.safeParse(req.body);
    const prompt = input.success ? promptOf(input.data) : null;
    if (!input.success || prompt === null) {
      return sendError(res, 400, "invalid_request", input.success ? "The run input needs a last user message with text (1-2000 characters)." : describeIssues(input.error));
    }
    const refused = versionError(requestedVersion(req));
    if (refused) return res.status(400).json(refused);
    const encoder = new AgUiEncoder({ threadId: input.data.threadId, runId: input.data.runId, messageId: `${input.data.runId}-screen` });
    const events = (list: ReturnType<AgUiEncoder["start"]>) => list.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    await stream(req, res, prompt, {
      route: "ag-ui",
      start: (send) => send(events(encoder.start())),
      text: (send, text) => send(events(encoder.write(text))),
      done: (send) => send(events(encoder.finish())),
      error: (send, error) => send(events(encoder.fail(error.message, error.code))),
    });
  });

  /**
   * Run the model for one request and stream its text as Server-Sent Events in the given format:
   * rate limit, heartbeat, timeout, abort on disconnect, and a log entry. The output never changes
   * what the model wrote; the client's parser decides what is valid.
   */
  async function stream(req: Request, res: Response, prompt: string, output: StreamOutput) {
    // A setup that hasn't passed its model check isn't served when the check is enforced ([10.23]).
    const admitted = gate.admit();
    if (!admitted.ok) {
      log({ event: output.route, model: model.kind, outcome: "model_unverified" });
      res.setHeader("Retry-After", String(admitted.retryAfterSeconds));
      return sendError(res, 503, "model_unverified", admitted.message, true);
    }
    // Limited per address, and per signed-in person wherever their requests come from. Generation
    // doesn't require sign-in, and nothing about the person is added to the prompt.
    const { user } = await identify(req);
    const byAddress = allow(req.ip ?? "unknown");
    const limit = byAddress.ok && user ? allow(`user:${user.id}`) : byAddress;
    if (!limit.ok) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // stop proxies from buffering the stream
    res.flushHeaders();

    const started = now();
    const controller = new AbortController();
    let clientGone = false;
    let timedOut = false;
    let chunks = 0;
    let chars = 0;

    const send = (frame: string) => {
      if (frame !== "" && !clientGone && !res.writableEnded) res.write(frame);
    };
    const heartbeat = setInterval(() => {
      if (!clientGone && !res.writableEnded) res.write(": ping\n\n");
    }, heartbeatMs);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);
    res.on("close", () => {
      if (!res.writableEnded) {
        clientGone = true;
        controller.abort();
      }
    });

    // Observer: parses the same text server-side purely to log how well the model followed the
    // protocol. It never changes what is forwarded; the client's parser is the one that matters.
    const observer = createParser({ tools, assets, components, pictures });
    const parse = { errors: {} as Record<string, number>, warnings: {} as Record<string, number> };
    observer.subscribe((e) => {
      if (e.type === "error") parse.errors[e.issue.code] = (parse.errors[e.issue.code] ?? 0) + 1;
      if (e.type === "warning") parse.warnings[e.issue.code] = (parse.warnings[e.issue.code] ?? 0) + 1;
    });

    const entry: Record<string, unknown> = { event: output.route, model: model.kind, promptChars: prompt.length };
    output.start(send);
    observer.write(MARKER_CHUNK);
    try {
      const result = await model.generate(prompt, {
        signal: controller.signal,
        onText: (text) => {
          chunks++;
          chars += text.length;
          output.text(send, text);
          observer.write(text);
        },
      });
      output.done(send, { stopReason: result.stopReason, model: result.model, ms: now() - started });
      Object.assign(entry, { outcome: "done", stopReason: result.stopReason, usage: result.usage });
    } catch (err) {
      if (clientGone) {
        entry.outcome = "client_disconnected";
      } else if (timedOut) {
        entry.outcome = "timeout";
        output.error(send, { code: "timeout", message: "The model took too long to respond.", retryable: true });
      } else {
        const event = generateError(err);
        Object.assign(entry, { outcome: "error", code: event.code });
        // Unknown errors may contain internals: logged here, while the client gets a generic message.
        if (!(err instanceof ModelError)) entry.error = err instanceof Error ? err.message : String(err);
        output.error(send, event);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (!res.writableEnded) res.end();
      observer.end();
      // Finished live replies feed the live re-check ([10.24]); cancelled or failed ones say nothing about the model.
      if (entry.outcome === "done") gate.observe(Object.keys(parse.errors).length > 0);
      log({ ...entry, ms: now() - started, chunks, chars, parse: { ...parse, components: observer.getSnapshot().nodes.size } });
    }
  }

  // Governed actions from McpMutationBoundary. The server re-checks the tool and params itself:
  // the browser's checks can be bypassed by anyone who posts here directly.
  app.post("/api/mutate", async (req, res) => {
    const body = MutateBody.safeParse(req.body);
    if (!body.success) {
      return sendError(res, 400, "invalid_request", describeIssues(body.error));
    }
    const { tool, params } = body.data;
    const entry: Record<string, unknown> = { event: "mutate", tool: tool.slice(0, 128) };

    // Rate limit first, so probing for tool names is throttled too.
    if (!allowMutate(req.ip ?? "unknown").ok) {
      log({ ...entry, outcome: "rate_limited" });
      return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
    }
    const { user, via } = await identify(req);
    entry.userId = user?.id ?? null;
    // Each signed-in person is limited too, wherever their requests come from.
    if (user && !allowMutate(`user:${user.id}`).ok) {
      log({ ...entry, outcome: "rate_limited" });
      return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
    }
    if (badOrigin(req, via)) {
      log({ ...entry, outcome: "bad_origin" });
      return sendError(res, 403, "bad_origin", "This request didn't come from the app.");
    }
    const answer = await runMutation(
      { tool, params, user, idempotencyKey: req.get("idempotency-key") ?? null },
      { tools, handlers, ctx: { store, mailer, now: now(), publicUrl: config.publicUrl } },
    );
    log({ ...entry, outcome: answer.outcome, ...answer.detail });
    return res.status(answer.status).json(answer.body);
  });

  // Sign-in (PLAN-BACKEND.md B). The emailed link lands here in a browser: a session cookie, then home.
  app.get("/api/auth/callback", async (req, res) => {
    await ready;
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const signedIn = await redeemLink(store, token, now());
    log({ event: "sign_in", outcome: signedIn ? "ok" : "expired", userId: signedIn?.user.id ?? null });
    if (!signedIn) return res.redirect(303, "/?signin=expired");
    res.setHeader("Set-Cookie", sessionCookie(signedIn.session, secure));
    return res.redirect(303, "/");
  });

  // A native app that caught the link (a universal or app link) trades it for a bearer token.
  app.post("/api/auth/session", async (req, res) => {
    if (!allow(req.ip ?? "unknown").ok) return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
    const token = typeof req.body?.token === "string" ? (req.body.token as string) : "";
    const signedIn = await (async () => {
      await ready;
      return redeemLink(store, token, now());
    })();
    log({ event: "sign_in", via: "bearer", outcome: signedIn ? "ok" : "expired", userId: signedIn?.user.id ?? null });
    if (!signedIn) return sendError(res, 400, "invalid_request", "This sign-in link has expired or was already used.");
    return res.json({ token: signedIn.session, expiresAt: now() + SESSION_TTL_MS });
  });

  app.post("/api/auth/signout", async (req, res) => {
    await ready;
    const credentials = credentialsOf({ authorization: req.get("authorization"), cookie: req.get("cookie") });
    if (badOrigin(req, credentials.via)) return sendError(res, 403, "bad_origin", "This request didn't come from the app.");
    if (credentials.token) await endSession(store, credentials.token);
    if (credentials.via === "cookie") res.setHeader("Set-Cookie", clearedCookie(secure));
    return res.status(204).end();
  });

  app.get("/api/auth/me", async (req, res) => {
    const { user } = await identify(req);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ user: user ? { email: user.email } : null, ...(config.auth === "demo" && !authenticate ? { demo: true } : {}) });
  });

  // MCP Apps hosts (PLAN-MCPAPPS.md): one MCP server per request, for the person whose bearer token
  // the host sends. A cookie never identifies anyone here: any page could make a browser send it.
  if (mcp) {
    const handler = createMcpHandler(({ authInfo }) => mcp.serverFor((authInfo?.extra?.user as User | undefined) ?? null), {
      onerror: (error) => log({ event: "mcp", outcome: "error", error: error.message }),
    });
    app.all("/mcp", async (req, res) => {
      if (!allow(req.ip ?? "unknown").ok) return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
      const { user, via } = await identify(req);
      if (badOrigin(req, via) || via === "cookie") return sendError(res, 403, "bad_origin", "MCP clients sign in with a bearer token.");
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
      const request = new Request(new URL(req.originalUrl, config.publicUrl), {
        method: req.method,
        headers,
        body: req.method === "POST" ? JSON.stringify(req.body ?? null) : undefined,
      });
      const authInfo = user ? { token: "omni-ir-session", clientId: via ?? "omni-ir", scopes: [], extra: { user } } : undefined;
      const response = await handler.fetch(request, { authInfo, parsedBody: req.body });
      res.status(response.status);
      response.headers.forEach((value, name) => res.setHeader(name, value));
      if (!response.body) return res.end();
      for await (const chunk of response.body) res.write(chunk);
      res.end();
    });
  }

  app.use((_req, res) => sendError(res, 404, "not_found", "Not found."));

  // Malformed JSON, oversized bodies and anything else thrown before a handler responds.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;
    if (status >= 400 && status < 500) return res.status(400).json(INVALID_JSON);
    log({ event: "server_error", error: err instanceof Error ? err.message : String(err) });
    return sendError(res, 500, "server_error", "Something went wrong.");
  });

  return app;
}

function sendError(res: Response, status: number, code: string, message: string, retryable = false) {
  res.status(status).json(errorBody(code, message, retryable));
}

/** Allow the configured origin only; answer preflight requests directly. */
function cors(origin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.origin === origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (req.headers.origin === origin) {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "content-type");
        res.setHeader("Access-Control-Max-Age", "600");
      }
      return res.status(204).end();
    }
    next();
  };
}

/** Sliding one-minute window per client IP, kept in memory. */
function rateLimiter(perMinute: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return (ip: string): { ok: true } | { ok: false; retryAfterSeconds: number } => {
    const t = now();
    const recent = (hits.get(ip) ?? []).filter((at) => t - at < RATE_WINDOW_MS);
    if (recent.length >= perMinute) {
      hits.set(ip, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + RATE_WINDOW_MS - t) / 1000)) };
    }
    recent.push(t);
    hits.set(ip, recent);
    return { ok: true };
  };
}

function defaultLog(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }));
}
