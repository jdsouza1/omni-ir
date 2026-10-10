// Browser helper: POST a prompt to /api/generate and feed the SSE stream into an Omni-IR parser.
// The text is written to the parser exactly as it arrives; the parser and schema decide what is valid.
// Once the stream has started, the parser is always ended (done, error, cancel or dropped connection),
// so anything that never arrived becomes a "missing" fallback instead of loading forever.
import { FORMAT_VERSION, type OmniParser } from "@omni-ir/core";
import { readEvents } from "./sse.js";

export type GenerateOutcome =
  | {
      status: "done";
      stopReason: "end_turn" | "max_tokens" | "refusal";
      model: string;
      ms: number;
      /** The server keeps this screen current: pass it to followScreen() ([10.36]). */
      screen?: string;
    }
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

type ErrorOutcome = Extract<GenerateOutcome, { status: "error" }>;

export async function generate(prompt: string, options: GenerateClientOptions): Promise<GenerateOutcome> {
  const { parser, signal, baseUrl = "", fetch: doFetch = globalThis.fetch, idleTimeoutMs = 45_000 } = options;

  // Ask for this package's format ([10.1]). A server that compares versions exactly (0.6 and 0.7 did)
  // refuses a different number; one retry without a version gets the stream, and the parser's marker
  // check decides whether the screen needs a newer app ([10.12], [3.9]).
  const request = (withVersion: boolean) =>
    doFetch(`${baseUrl}/api/generate${withVersion ? `?version=${FORMAT_VERSION}` : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ prompt }),
      ...(signal ? { signal } : {}),
    });

  let response: Response;
  try {
    response = await request(true);
    if (!response.ok || response.body === null) {
      const refused = await readErrorResponse(response);
      if (refused.code !== "unsupported_version") return refused;
      response = await request(false);
    }
  } catch {
    if (signal?.aborted) return { status: "aborted" };
    return { status: "error", code: "network_error", message: "Could not reach the server.", retryable: true };
  }

  // Errors before the stream starts (bad request, rate limit): the parser is left untouched.
  if (!response.ok || response.body === null) return readErrorResponse(response);

  let outcome: GenerateOutcome | null = null;
  let screen: string | undefined;

  try {
    for await (const { event, data: payload } of readEvents(response.body, idleTimeoutMs)) {
      if (outcome !== null) continue; // everything after the terminal event is ignored [10.8]
      if (event === "chunk" && typeof payload.text === "string") {
        parser.write(payload.text);
      } else if (event === "live" && typeof payload.screen === "string" && payload.screen !== "") {
        screen = payload.screen; // this screen is kept current: follow it once it's done ([10.36])
      } else if (event === "done") {
        outcome = {
          status: "done",
          stopReason: payload.stopReason as "end_turn" | "max_tokens" | "refusal",
          model: String(payload.model),
          ms: Number(payload.ms),
          ...(screen === undefined ? {} : { screen }),
        };
      } else if (event === "error") {
        outcome = toError(payload);
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

export function toError(payload: Record<string, unknown> | undefined): ErrorOutcome {
  return {
    status: "error",
    code: typeof payload?.code === "string" ? payload.code : "server_error",
    message: typeof payload?.message === "string" ? payload.message : "Something went wrong.",
    retryable: payload?.retryable === true,
  };
}

export async function readErrorResponse(response: Response): Promise<ErrorOutcome> {
  try {
    const body = (await response.json()) as { error?: Record<string, unknown> };
    return toError(body.error);
  } catch {
    return { status: "error", code: "server_error", message: `Request failed (${response.status}).`, retryable: response.status >= 500 };
  }
}
