// ClaudeModel: the opt-in real model. OFF by default: the server only uses it when OMNI_MODEL=claude.
// Every call is billed by Anthropic, so a daily cap stops it after `dailyCap` generations per UTC day.
// Only text deltas are forwarded; thinking is never sent to the browser.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ModelError, type GenerateOptions, type GenerateResult, type Model, type ModelSetup, type StopReason } from "./types";

export const CLAUDE_MODEL_ID = "claude-opus-5-5";

/** The slice of the SDK this adapter uses, so tests can pass a fake client with no network access. */
export interface ClaudeClient {
  beta: {
    messages: {
      stream(
        body: BetaMessageStreamParams,
        options?: { signal?: AbortSignal },
      ): ClaudeStream;
    };
  };
}

export interface ClaudeStream extends AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> {
  finalMessage(): Promise<Pick<Anthropic.Beta.Messages.BetaMessage, "stop_reason" | "model" | "usage">>;
  abort(): void;
}

export interface ClaudeModelOptions {
  client: ClaudeClient;
  systemPrompt: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Maximum generations per UTC day. */
  dailyCap: number;
  maxTokens?: number;
  now?: () => number;
}

export class ClaudeModel implements Model {
  readonly kind = "claude" as const;
  private day = "";
  private used = 0;

  constructor(private readonly options: ClaudeModelOptions) {}

  get setup(): ModelSetup {
    return { id: CLAUDE_MODEL_ID, systemPrompt: this.options.systemPrompt, settings: { effort: this.options.effort, maxTokens: this.options.maxTokens ?? 16_000 } };
  }

  async generate(prompt: string, { signal, onText }: GenerateOptions): Promise<GenerateResult> {
    if (signal.aborted) throw new ModelError("aborted", "Generation was cancelled.");
    this.countOrRefuse();

    const stream = this.options.client.beta.messages.stream(
      {
        model: CLAUDE_MODEL_ID,
        max_tokens: this.options.maxTokens ?? 16_000,
        // Claude Opus 5.5 always thinks adaptively; effort is the only control (default there is medium).
        output_config: { effort: this.options.effort },
        // If the model declines on policy grounds, the API retries on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // One stable block, cached: only the user's prompt changes between requests.
        system: [{ type: "text", text: this.options.systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      },
      { signal },
    );
    const onAbort = () => stream.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      for await (const event of stream) {
        if (signal.aborted) break;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
      }
      if (signal.aborted) throw new ModelError("aborted", "Generation was cancelled.");
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        throw new ModelError("refusal", "The model declined this request. Try describing the screen differently.");
      }
      return {
        stopReason: toStopReason(message.stop_reason),
        model: message.model,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (err) {
      throw toModelError(err, signal);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  /** Counts attempts, not successes, so failures can't be used to exceed the cap. */
  private countOrRefuse(): void {
    const today = new Date((this.options.now ?? Date.now)()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.options.dailyCap) {
      throw new ModelError("daily_cap", "Today's generation limit has been reached. Try again tomorrow.");
    }
    this.used++;
  }
}

function toStopReason(reason: string | null): StopReason {
  return reason === "max_tokens" || reason === "model_context_window_exceeded" ? "max_tokens" : "end_turn";
}

function toModelError(err: unknown, signal: AbortSignal): ModelError {
  if (err instanceof ModelError) return err;
  if (signal.aborted || err instanceof Anthropic.APIUserAbortError) return new ModelError("aborted", "Generation was cancelled.");
  if (err instanceof Anthropic.RateLimitError) return new ModelError("rate_limited", "The model is busy; try again shortly.", true);
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("unavailable", "The AI model is not configured on this server.");
  }
  if (err instanceof Anthropic.BadRequestError) return new ModelError("model_error", "The model rejected the request.");
  if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
    return new ModelError("unavailable", "The model is temporarily unavailable; try again shortly.", true);
  }
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) {
    return new ModelError("unavailable", "The model is temporarily unavailable; try again shortly.", true);
  }
  return new ModelError("model_error", "Generation failed.", true);
}
