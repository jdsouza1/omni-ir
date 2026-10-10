// Browser helper: the default onMutation for <OmniRenderer>, posting governed actions to /api/mutate
// ([10.14]). The server checks every call again. If it refuses, this throws; the renderer reports
// that as a handler_failed error event with the server's message.
//
// Each press gets its own Idempotency-Key. If the connection drops before the answer arrives, the
// call is retried once with the same key, so a server that honours keys never runs it twice.
import type { MutationCall } from "../renderer/context.js";

export class MutationRejectedError extends Error {
  override name = "MutationRejectedError";
  /** The server's error code, such as "sign_in_required", "not_found" or "unavailable", when it gave one. */
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export interface MutationClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Called with the server's result after a successful action (e.g. to show a receipt). */
  onResult?: (call: MutationCall, result: Record<string, unknown>) => void;
  /** Whether to send cookies: "same-origin" (the default) or "include" for an API on another origin. */
  credentials?: RequestCredentials;
  /** A bearer token for servers that use them instead of a session cookie. */
  token?: string | (() => string | null);
  /**
   * Called with the update a successful action's result carries ([10.35]), to apply to the screen the
   * Button was pressed on: usually `(text) => parser.update(text)`. The pressed Button's id is sent so
   * the server can write the update for it.
   */
  onUpdate?: (update: string, call: MutationCall) => void;
}

export function createMutationHandler(options: MutationClientOptions = {}): (call: MutationCall) => Promise<void> {
  const { baseUrl = "", fetch: doFetch = globalThis.fetch, onResult, credentials = "same-origin", token, onUpdate } = options;

  return async (call) => {
    const bearer = typeof token === "function" ? token() : token;
    const init: RequestInit = {
      method: "POST",
      credentials,
      headers: {
        "content-type": "application/json",
        "idempotency-key": globalThis.crypto.randomUUID(),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ tool: call.tool, params: call.params, ...(onUpdate ? { button: call.target } : {}) }),
    };
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/mutate`, init);
    } catch {
      try {
        response = await doFetch(`${baseUrl}/api/mutate`, init); // the same key: never runs twice
      } catch {
        throw new MutationRejectedError("Could not reach the server.");
      }
    }
    const body = (await response.json().catch(() => null)) as
      | { result?: Record<string, unknown>; update?: unknown; error?: { code?: string; message?: string } }
      | null;
    if (!response.ok) throw new MutationRejectedError(body?.error?.message ?? `The action failed (${response.status}).`, body?.error?.code);
    onResult?.(call, body?.result ?? {});
    if (onUpdate && typeof body?.update === "string") onUpdate(body.update, call);
  };
}
