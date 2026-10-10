// Server-Sent Events as SPEC.md [10.6] reads them, shared by generate() and followScreen(): a blank line
// ends an event, `\r\n` counts as `\n`, `:` starts a comment, several `data:` lines join with `\n`, an
// event without data is skipped. Data that isn't a JSON object is skipped too ([10.7]).

const IDLE = Symbol("idle");

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * The events of a response body, in order. Ends when the body ends, or with `"idle"` after
 * `idleTimeoutMs` without any bytes ([10.10]). Throws if reading fails (a dropped connection).
 */
export async function* readEvents(body: ReadableStream<Uint8Array>, idleTimeoutMs: number): AsyncGenerator<SseEvent, "ended" | "idle"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<typeof IDLE>((resolve) => (timer = setTimeout(() => resolve(IDLE), idleTimeoutMs)));
      const read = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
      if (read === IDLE) {
        void reader.cancel().catch(() => {});
        return "idle";
      }
      if (read.done) return "ended";
      // Normalise CRLF framing; a "\r" left at the end joins its "\n" on the next read.
      buffer = (buffer + decoder.decode(read.value, { stream: true })).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const parsed = parseBlock(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (parsed !== null) yield parsed;
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // comment, e.g. heartbeat
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  try {
    const payload = JSON.parse(data.join("\n")) as unknown;
    return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? { event, data: payload as Record<string, unknown> } : null;
  } catch {
    return null; // not ours to interpret; skip it
  }
}
