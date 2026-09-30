// ClaudeModel with a fake SDK client: no network, no API key, no cost.
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeModel, CLAUDE_MODEL_ID, type ClaudeClient, type ClaudeStream } from "../server/models/claude";
import { ModelError } from "../server/models/types";

type Event = { type: string; delta?: { type: string; text?: string; thinking?: string } };

interface FakeOptions {
  events?: Event[];
  stopReason?: string;
  model?: string;
  /** Throw this instead of streaming. */
  error?: unknown;
  /** Wait for abort after the first event. */
  hang?: boolean;
}

function fakeClient(options: FakeOptions = {}) {
  const calls: { body: Record<string, unknown>; signal?: AbortSignal }[] = [];
  let aborted = false;
  const client: ClaudeClient = {
    beta: {
      messages: {
        stream(body, requestOptions) {
          calls.push({ body: body as unknown as Record<string, unknown>, ...(requestOptions?.signal ? { signal: requestOptions.signal } : {}) });
          const stream = {
            async *[Symbol.asyncIterator]() {
              if (options.error) throw options.error;
              for (const [i, event] of (options.events ?? []).entries()) {
                yield event;
                if (options.hang && i === 0) {
                  await new Promise<void>((resolve) => {
                    const check = setInterval(() => aborted && (clearInterval(check), resolve()), 5);
                  });
                  throw new Anthropic.APIUserAbortError();
                }
              }
            },
            finalMessage: async () => ({
              stop_reason: options.stopReason ?? "end_turn",
              model: options.model ?? CLAUDE_MODEL_ID,
              usage: { input_tokens: 5000, output_tokens: 300, cache_read_input_tokens: 4800, cache_creation_input_tokens: 0 },
            }),
            abort: () => {
              aborted = true;
            },
          };
          return stream as unknown as ClaudeStream;
        },
      },
    },
  };
  return { client, calls, wasAborted: () => aborted };
}

const text = (t: string): Event => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } });
const thinking = (t: string): Event => ({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: t } });

function model(client: ClaudeClient, extra: Partial<ConstructorParameters<typeof ClaudeModel>[0]> = {}) {
  return new ClaudeModel({ client, systemPrompt: "SYSTEM PROMPT", effort: "low", dailyCap: 50, ...extra });
}

async function run(m: ClaudeModel, signal = new AbortController().signal) {
  const chunks: string[] = [];
  const result = await m.generate("a payment screen", { signal, onText: (t) => chunks.push(t) });
  return { chunks, result };
}

describe("ClaudeModel request", () => {
  it("sends Opus 5.5 at the configured effort, a cached system prompt, the refusal fallback and the user prompt", async () => {
    const fake = fakeClient({ events: [text("root = Divider()\n")] });
    await run(model(fake.client, { effort: "medium" }));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.body).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 16_000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "a payment screen" }],
    });
    expect(fake.calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("ClaudeModel streaming", () => {
  it("forwards text deltas only, never thinking", async () => {
    const fake = fakeClient({ events: [{ type: "message_start" }, thinking("secret reasoning"), text("root = "), text("Divider()\n"), { type: "message_stop" }] });
    const { chunks } = await run(model(fake.client));
    expect(chunks).toEqual(["root = ", "Divider()\n"]);
  });

  it("returns stop reason, the model that served it (after any fallback) and token usage", async () => {
    const fake = fakeClient({ events: [text("x")], model: "claude-opus-4-8" });
    const { result } = await run(model(fake.client));
    expect(result).toEqual({
      stopReason: "end_turn",
      model: "claude-opus-4-8",
      usage: { inputTokens: 5000, outputTokens: 300, cacheReadTokens: 4800, cacheWriteTokens: 0 },
    });
  });

  it.each([
    ["max_tokens", "max_tokens"],
    ["model_context_window_exceeded", "max_tokens"],
    ["end_turn", "end_turn"],
    ["pause_turn", "end_turn"],
  ])("maps stop_reason %s → %s", async (stop, expected) => {
    const { result } = await run(model(fakeClient({ events: [text("x")], stopReason: stop }).client));
    expect(result.stopReason).toBe(expected);
  });

  it("turns a refusal into a ModelError", async () => {
    const run1 = run(model(fakeClient({ events: [text("x")], stopReason: "refusal" }).client));
    await expect(run1).rejects.toMatchObject({ code: "refusal", retryable: false });
  });
});

describe("ClaudeModel errors", () => {
  const headers = new Headers();
  it.each([
    ["rate limit", new Anthropic.RateLimitError(429, undefined, "rate limited", headers), "rate_limited", true],
    ["bad key", new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", headers), "unavailable", false],
    ["bad request", new Anthropic.BadRequestError(400, undefined, "bad", headers), "model_error", false],
    ["overloaded", new Anthropic.InternalServerError(529, undefined, "overloaded", headers), "unavailable", true],
    ["network", new Anthropic.APIConnectionError({ message: "ECONNRESET" }), "unavailable", true],
    ["unknown", new Error("weird"), "model_error", true],
  ])("%s → %s", async (_, error, code, retryable) => {
    const attempt = run(model(fakeClient({ error }).client));
    await expect(attempt).rejects.toBeInstanceOf(ModelError);
    await expect(attempt).rejects.toMatchObject({ code, retryable });
  });

  it("never passes the SDK's error text (which may mention keys) to the browser", async () => {
    const error = new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key sk-ant-123", new Headers());
    await expect(run(model(fakeClient({ error }).client))).rejects.toSatisfy(
      (e: ModelError) => !e.message.includes("sk-ant-123"),
    );
  });
});

describe("ClaudeModel abort and daily cap", () => {
  it("aborts the SDK stream when the signal fires", async () => {
    const fake = fakeClient({ events: [text("root = Card([a])\n"), text("more")], hang: true });
    const controller = new AbortController();
    const chunks: string[] = [];
    const attempt = model(fake.client).generate("x", {
      signal: controller.signal,
      onText: (t) => {
        chunks.push(t);
        controller.abort();
      },
    });
    await expect(attempt).rejects.toMatchObject({ code: "aborted" });
    expect(fake.wasAborted()).toBe(true);
    expect(chunks).toEqual(["root = Card([a])\n"]);
  });

  it("refuses after the daily cap without calling the API, and resets the next UTC day", async () => {
    let clock = Date.parse("2026-09-30T10:00:00Z");
    const fake = fakeClient({ events: [text("x")] });
    const m = model(fake.client, { dailyCap: 2, now: () => clock });
    await run(m);
    await run(m);
    await expect(run(m)).rejects.toMatchObject({ code: "daily_cap", retryable: false });
    expect(fake.calls).toHaveLength(2);

    clock = Date.parse("2026-10-01T00:00:01Z");
    await run(m);
    expect(fake.calls).toHaveLength(3);
  });

  it("counts failed attempts toward the cap", async () => {
    const fake = fakeClient({ error: new Anthropic.APIConnectionError({ message: "down" }) });
    const m = model(fake.client, { dailyCap: 1 });
    await expect(run(m)).rejects.toMatchObject({ code: "unavailable" });
    await expect(run(m)).rejects.toMatchObject({ code: "daily_cap" });
  });
});
