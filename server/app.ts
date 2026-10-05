// Express app for Omni-IR. POST /api/generate streams the model's Omni-IR text to the browser as
// Server-Sent Events. The server relays text and never trusts it: validation happens in the
// browser's parser and schema, the trusted zone.
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ASSETS, type AssetRegistry } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createParser } from "@omni-ir/core";
import type { ToolRegistry } from "@omni-ir/core";
import type { ServerConfig } from "./config";
import { describeIssues, errorBody, GenerateBody, generateError, INVALID_JSON, MutateBody, runMutation, sseEvent } from "./api";
import { ModelError, type Model } from "./models/types";
import { STUB_HANDLERS, type ToolHandler } from "./tools/handlers";

export interface AppOptions {
  config: ServerConfig;
  model: Model;
  /** Tools the server will run; defaults to the shared registry. */
  tools?: ToolRegistry;
  /** Image assets streams may name; defaults to the shared registry. */
  assets?: AssetRegistry;
  /** Handler per tool; defaults to the stubs. */
  handlers?: Readonly<Record<string, ToolHandler>>;
  /** Heartbeat interval for SSE streams (default 15 s). */
  heartbeatMs?: number;
  /** Structured log sink; never receives prompt text. */
  log?: (entry: Record<string, unknown>) => void;
  /** Clock, injectable for rate-limit tests. */
  now?: () => number;
}

const RATE_WINDOW_MS = 60_000;

export function createApp({
  config,
  model,
  tools = TOOLS,
  assets = ASSETS,
  handlers = STUB_HANDLERS,
  heartbeatMs = 15_000,
  log = defaultLog,
  now = Date.now,
}: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors(config.corsOrigin));
  app.use(express.json({ limit: "16kb" }));

  const allow = rateLimiter(config.rateLimitPerMinute, now);
  // Mutations are cheap for the server but may hit real services later; allow more, still bounded.
  const allowMutate = rateLimiter(config.rateLimitPerMinute * 3, now);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: model.kind });
  });

  app.post("/api/generate", async (req, res) => {
    const body = GenerateBody.safeParse(req.body);
    if (!body.success) {
      return sendError(res, 400, "invalid_request", describeIssues(body.error));
    }
    const limit = allow(req.ip ?? "unknown");
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

    const send = (event: string, data: unknown) => {
      if (!clientGone && !res.writableEnded) res.write(sseEvent(event, data));
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
    // protocol. It never changes what is forwarded; the browser's parser is the one that matters.
    const observer = createParser({ tools, assets });
    const parse = { errors: {} as Record<string, number>, warnings: {} as Record<string, number> };
    observer.subscribe((e) => {
      if (e.type === "error") parse.errors[e.issue.code] = (parse.errors[e.issue.code] ?? 0) + 1;
      if (e.type === "warning") parse.warnings[e.issue.code] = (parse.warnings[e.issue.code] ?? 0) + 1;
    });

    const entry: Record<string, unknown> = { event: "generate", model: model.kind, promptChars: body.data.prompt.length };
    try {
      const result = await model.generate(body.data.prompt, {
        signal: controller.signal,
        onText: (text) => {
          chunks++;
          chars += text.length;
          send("chunk", { text });
          observer.write(text);
        },
      });
      send("done", { stopReason: result.stopReason, model: result.model, ms: now() - started });
      Object.assign(entry, { outcome: "done", stopReason: result.stopReason, usage: result.usage });
    } catch (err) {
      if (clientGone) {
        entry.outcome = "client_disconnected";
      } else if (timedOut) {
        entry.outcome = "timeout";
        send("error", { code: "timeout", message: "The model took too long to respond.", retryable: true });
      } else {
        const event = generateError(err);
        Object.assign(entry, { outcome: "error", code: event.code });
        // Unknown errors may contain internals: logged here, while the browser gets a generic message.
        if (!(err instanceof ModelError)) entry.error = err instanceof Error ? err.message : String(err);
        send("error", event);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (!res.writableEnded) res.end();
      observer.end();
      log({ ...entry, ms: now() - started, chunks, chars, parse: { ...parse, components: observer.getSnapshot().nodes.size } });
    }
  });

  // Governed actions from McpMutationBoundary. The server re-checks the tool and params itself:
  // the browser's checks can be bypassed by anyone who posts here directly.
  app.post("/api/mutate", async (req, res) => {
    const body = MutateBody.safeParse(req.body);
    if (!body.success) {
      return sendError(res, 400, "invalid_request", describeIssues(body.error));
    }
    const { tool, params } = body.data;
    const entry = { event: "mutate", tool: tool.slice(0, 128) };

    // Rate limit first, so probing for tool names is throttled too.
    if (!allowMutate(req.ip ?? "unknown").ok) {
      log({ ...entry, outcome: "rate_limited" });
      return sendError(res, 429, "rate_limited", "Too many requests; try again shortly.", true);
    }
    const answer = await runMutation(tool, params, tools, handlers);
    log({ ...entry, outcome: answer.outcome, ...answer.detail });
    return res.status(answer.status).json(answer.body);
  });

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
