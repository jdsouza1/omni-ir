import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type AppOptions } from "../server/app";
import { loadConfig, type ServerConfig } from "../server/config";
import type { GenerateOptions, GenerateResult, Model } from "../server/models/types";

export interface SseEvent {
  event: string;
  data: unknown;
}

/** Start the app on a random port. */
export async function startServer(
  options: Omit<Partial<AppOptions>, "config" | "model"> & { model: Model; config?: Partial<ServerConfig> },
) {
  // Tests that don't sign anyone in act as the demo visitor; tests of sign-in pass auth: "magic-link".
  const config: ServerConfig = { ...loadConfig({}).config, mockSpeed: "instant", auth: "demo", ...options.config };
  const logs: Record<string, unknown>[] = [];
  const app = createApp({ log: (e) => logs.push(e), ...options, config });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    logs,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await (app.locals.closeStore as (() => Promise<void>) | undefined)?.();
    },
    generate: (body: unknown, init: RequestInit = {}) =>
      fetch(`${url}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
      }),
  };
}

/** Read a whole SSE response into events (comments such as heartbeats are returned separately). */
export async function readSse(response: Response): Promise<{ events: SseEvent[]; comments: string[]; raw: string }> {
  const raw = await response.text();
  const events: SseEvent[] = [];
  const comments: string[] = [];
  for (const block of raw.split("\n\n")) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) comments.push(line.slice(1).trim());
      else if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (data) events.push({ event, data: JSON.parse(data) });
  }
  return { events, comments, raw };
}

export const textOf = (events: SseEvent[]) =>
  events.flatMap((e) => (e.event === "chunk" ? [(e.data as { text: string }).text] : [])).join("");

/** A scripted model for server tests. */
export class FakeModel implements Model {
  readonly kind = "mock" as const;
  calls = 0;
  /** Every prompt the model was given, in order. */
  readonly prompts: string[] = [];
  lastSignal: AbortSignal | null = null;
  abortedAt: number | null = null;

  constructor(private readonly script: (options: GenerateOptions) => Promise<GenerateResult>) {}

  generate(prompt: string, options: GenerateOptions): Promise<GenerateResult> {
    this.calls++;
    this.prompts.push(prompt);
    this.lastSignal = options.signal;
    options.signal.addEventListener("abort", () => (this.abortedAt = performance.now()), { once: true });
    return this.script(options);
  }
}

export const waitForAbort = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
