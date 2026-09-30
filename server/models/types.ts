// The one interface the server knows about. MockModel (free, default) and ClaudeModel (opt-in)
// both implement it, so the HTTP layer never depends on which model is behind it.

export type StopReason = "end_turn" | "max_tokens" | "refusal";

export interface GenerateResult {
  stopReason: StopReason;
  /** Which model produced the text: "mock", or the Claude model id. */
  model: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

export interface GenerateOptions {
  /** Aborting stops generation; the promise then rejects with ModelError("aborted"). */
  signal: AbortSignal;
  /** Called with each piece of Omni-IR text as it is produced. Never called after abort. */
  onText: (text: string) => void;
}

export interface Model {
  readonly kind: "mock" | "claude";
  generate(prompt: string, options: GenerateOptions): Promise<GenerateResult>;
}

export type ModelErrorCode = "aborted" | "model_error" | "rate_limited" | "refusal" | "unavailable" | "daily_cap";

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ModelError";
  }
}
