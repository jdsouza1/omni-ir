// Browser helper: POST a prompt to /api/generate and feed the SSE stream into an Omni-IR parser.
// The text is written to the parser exactly as it arrives; the parser and schema decide what is valid.
// Once the stream has started, the parser is always ended (done, error, cancel or dropped connection),
// so anything that never arrived becomes a "missing" fallback instead of loading forever.
import { majorMinor, type OmniParser } from "@omni-ir/core";

export type GenerateOutcome =
  | { status: "done"; stopReason: "end_turn" | "max_tokens" | "refusal"; model: string; ms: number }
  | { status: "error"; code: string; message: string; retryable: boolean }
  | { status: "aborted" };

export interface GenerateClientOptions {
  parser: OmniParser;
  signal?: AbortSignal;
  /** Server origin; "" means same origin. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** With no bytes for this long, pings included, the stream counts as lost ([10.10]). Default 45 s. */
  idleTimeoutMs?: number;
}

const IDLE = Symbol("idle");

type ErrorOutcome = Extract<GenerateOutcome, { status: "error" }>;

export async function generate(prompt: string, options: GenerateClientOptions): Promise<GenerateOutcome> {
  const { parser, signal, baseUrl = "", fetch: doFetch = globalThis.fetch, idleTimeoutMs = 45_000 } = options;

  let response: Response;
  try {
    response = await doFetch(`${baseUrl}/api/generate?version=${majorMinor()}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ prompt }),
      ...(signal ? { signal } : {}),
    });
  } catch {
    if (signal?.aborted) return { status: "aborted" };
    return { status: "error", code: "network_error", message: "Could not reach the server.", retryable: true };
  }

  // Errors before the stream starts (bad request, rate limit): the parser is left untouched.
  if (!response.ok || response.body === null) return readErrorResponse(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: GenerateOutcome | null = null;

  const handleBlock = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue; // comment, e.g. heartbeat
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0 || outcome !== null) return; // everything after the terminal event is ignored [10.8]
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
    } catch {
      return; // not ours to interpret; skip it
    }
    if (event === "chunk" && typeof payload.text === "string") {
      parser.write(payload.text);
    } else if (event === "done") {
      outcome = {
        status: "done",
        stopReason: payload.stopReason as "end_turn" | "max_tokens" | "refusal",
        model: String(payload.model),
        ms: Number(payload.ms),
      };
    } else if (event === "error") {
      outcome = toError(payload);
    }
  };

  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<typeof IDLE>((resolve) => (timer = setTimeout(() => resolve(IDLE), idleTimeoutMs)));
      const read = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
      if (read === IDLE) {
        void reader.cancel().catch(() => {});
        break;
      }
      const { done, value } = read;
      if (done) break;
      // Normalise CRLF framing; a "\r" left at the end joins its "\n" on the next read.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        handleBlock(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
      }
    }
  } catch {
    parser.end();
    if (signal?.aborted) return { status: "aborted" };
    return connectionLost();
  }

  parser.end();
  return outcome ?? connectionLost();
}

function connectionLost(): ErrorOutcome {
  return { status: "error", code: "connection_lost", message: "The connection closed before the screen finished.", retryable: true };
}

function toError(payload: Record<string, unknown> | undefined): ErrorOutcome {
  return {
    status: "error",
    code: typeof payload?.code === "string" ? payload.code : "server_error",
    message: typeof payload?.message === "string" ? payload.message : "Something went wrong.",
    retryable: payload?.retryable === true,
  };
}

async function readErrorResponse(response: Response): Promise<ErrorOutcome> {
  try {
    const body = (await response.json()) as { error?: Record<string, unknown> };
    return toError(body.error);
  } catch {
    return { status: "error", code: "server_error", message: `Request failed (${response.status}).`, retryable: response.status >= 500 };
  }
}
