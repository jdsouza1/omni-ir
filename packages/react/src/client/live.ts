// Browser helper: follow a screen the server keeps current (SPEC.md [10.36]-[10.39]). After generate()
// reports `screen`, this reads its updates from /api/live and applies each to the screen's parser, in
// order, until the server says the screen won't change again, the app stops it, or the screen is gone.
// A dropped connection is followed again, from the last update received, waiting longer each time.
import type { OmniParser, UpdateResult } from "@omni-ir/core";
import { readErrorResponse } from "./generate.js";
import { readEvents } from "./sse.js";

export type FollowOutcome =
  /** The server sent `end`: the screen won't change again. */
  | { status: "ended" }
  /** The app stopped following (its signal). */
  | { status: "aborted" }
  /** The server refused for good: `not_found` (unknown, dropped or not this person's), or another error that isn't retryable. */
  | { status: "error"; code: string; message: string };

export interface FollowOptions {
  /** The ended screen's parser: updates are applied to it ([10.29]). */
  parser: OmniParser;
  signal?: AbortSignal;
  /** Server origin; "" means same origin. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Whether to send cookies: "same-origin" (the default) or "include" for an API on another origin. */
  credentials?: RequestCredentials;
  /** Called after each update with its result. A rejected update is a bug in the app's code ([10.33]): log it. */
  onUpdate?: (result: UpdateResult, seq: number) => void;
  /** With no bytes for this long, pings included, the connection counts as lost ([10.10]). Default 45 s. */
  idleTimeoutMs?: number;
  /** The first wait before following again; it doubles after each failure, up to a minute ([10.39]). Default 1 s. */
  retryMs?: number;
}

const MAX_WAIT_MS = 60_000;

export async function followScreen(screen: string, options: FollowOptions): Promise<FollowOutcome> {
  const { parser, signal, baseUrl = "", fetch: doFetch = globalThis.fetch, credentials = "same-origin", onUpdate, idleTimeoutMs = 45_000, retryMs = 1000 } = options;
  let last = 0;
  let failures = 0;

  while (!signal?.aborted) {
    let gotSomething = false;
    try {
      const url = `${baseUrl}/api/live?screen=${encodeURIComponent(screen)}&after=${last}`;
      const response = await doFetch(url, { headers: { accept: "text/event-stream" }, credentials, ...(signal ? { signal } : {}) });
      if (!response.ok || response.body === null) {
        const refused = await readErrorResponse(response);
        if (!refused.retryable) return { status: "error", code: refused.code, message: refused.message };
      } else {
        for await (const { event, data } of readEvents(response.body, idleTimeoutMs)) {
          gotSomething = true;
          if (event === "end") return { status: "ended" };
          // In order, each once; a rejected update still counts as received ([10.38]).
          if (event !== "update" || typeof data.text !== "string" || typeof data.seq !== "number" || !(data.seq > last)) continue;
          last = data.seq;
          // Applied whether or not the app listens (an optional call would skip its argument).
          const result = parser.update(data.text);
          onUpdate?.(result, last);
        }
      }
    } catch {
      // A dropped connection, or the app's signal: decided below.
    }
    if (signal?.aborted) break;
    failures = gotSomething ? 0 : failures + 1;
    const ok = await wait(Math.min(MAX_WAIT_MS, retryMs * 2 ** Math.max(0, failures - 1)), signal);
    if (!ok) break;
  }
  return { status: "aborted" };
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
