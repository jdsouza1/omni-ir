// Browser helper: the default onMutation for <OmniRenderer>, posting governed actions to /api/mutate.
// The server re-validates every call. If it refuses, this throws; the renderer reports that as a
// handler_failed error event with the server's message.
import type { MutationCall } from "../renderer/context";

export class MutationRejectedError extends Error {
  override name = "MutationRejectedError";
}

export interface MutationClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Called with the server's result after a successful action (e.g. to show a receipt). */
  onResult?: (call: MutationCall, result: Record<string, unknown>) => void;
}

export function createMutationHandler(options: MutationClientOptions = {}): (call: MutationCall) => Promise<void> {
  const { baseUrl = "", fetch: doFetch = globalThis.fetch, onResult } = options;

  return async (call) => {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/api/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: call.tool, params: call.params }),
      });
    } catch {
      throw new MutationRejectedError("Could not reach the server.");
    }
    const body = (await response.json().catch(() => null)) as
      | { result?: Record<string, unknown>; error?: { message?: string } }
      | null;
    if (!response.ok) throw new MutationRejectedError(body?.error?.message ?? `The action failed (${response.status}).`);
    onResult?.(call, body?.result ?? {});
  };
}
