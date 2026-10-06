// The API's rules, shared by the Express app (app.ts) and the in-browser API the hosted playground
// uses (inBrowser.ts), so both answer every request the same way. Imports nothing from Node.
import { z } from "zod";
import { majorMinor, versionMarker, type ToolRegistry } from "@omni-ir/core";
import { ModelError } from "./models/types";
import type { ToolHandler } from "./tools/handlers";

export const GenerateBody = z.strictObject({ prompt: z.string().trim().min(1).max(2000) });

/**
 * AG-UI 1.0's run input (RunAgentInput), as much as this server reads: the ids and the messages.
 * Other fields (tools, context, state, forwardedProps) are allowed and ignored.
 */
export const AgUiRunInput = z.looseObject({
  threadId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  messages: z.array(z.looseObject({ role: z.string(), content: z.unknown() })).max(200),
});

/** The prompt: the text of the last user message, or null when there is none of 1-2000 characters. */
export function promptOf(input: z.infer<typeof AgUiRunInput>): string | null {
  const last = [...input.messages].reverse().find((m) => m.role === "user");
  const content = last?.content;
  // Content is text, or a list of parts of which the text parts count.
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part: unknown) => (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text" ? String((part as { text?: unknown }).text ?? "") : "")).join("")
        : "";
  const prompt = text.trim();
  return prompt.length >= 1 && prompt.length <= 2000 ? prompt : null;
}

// `params` is checked as a plain object here and by the tool's own schema below. (z.record is not
// used: it silently drops a "__proto__" key instead of rejecting it.)
export const MutateBody = z.strictObject({
  tool: z.string().min(1).max(128),
  params: z.custom<Record<string, unknown>>(
    (v) => typeof v === "object" && v !== null && !Array.isArray(v),
    "params must be an object",
  ),
});
const RESERVED_KEYS = ["__proto__", "constructor", "prototype"];

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; issues?: { path: string; message: string }[] };
}

export const errorBody = (code: string, message: string, retryable = false): ApiErrorBody => ({ error: { code, message, retryable } });

export const INVALID_JSON = errorBody("invalid_request", "The request body must be JSON: {\"prompt\": \"…\"}.");

/** A failed body check as one readable message. */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

/**
 * The version a client asked for in the query ([10.1]), checked before streaming ([10.12]): null when
 * this server can write it (or none was asked for), otherwise the error to answer with (status 400).
 */
export function versionError(requested: string | null): ApiErrorBody | null {
  if (requested === null) return null;
  if (!/^\d+\.\d+$/.test(requested)) return errorBody("invalid_request", "version must be MAJOR.MINOR, such as 0.5.");
  if (requested === majorMinor()) return null;
  return errorBody("unsupported_version", `This server writes Omni-IR ${majorMinor()}; it can't write a stream for ${requested}.`);
}

/** The first chunk of every stream: the version marker, written by the server, not the model ([10.13]). */
export const MARKER_CHUNK = `${versionMarker()}\n`;

/** One Server-Sent Event. */
export const sseEvent = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** The `error` event for a generation that failed; unknown errors may hold internals, so they get a generic message. */
export function generateError(err: unknown): { code: string; message: string; retryable: boolean } {
  if (err instanceof ModelError) return { code: err.code, message: err.message, retryable: err.retryable };
  return { code: "model_error", message: "Generation failed.", retryable: true };
}

export interface MutationAnswer {
  status: number;
  body: unknown;
  /** For the log: ok, unknown_tool, invalid_params or tool_failed. */
  outcome: string;
  detail?: Record<string, unknown>;
}

/**
 * Run a governed action after checking it again: the tool must be registered and have a handler,
 * and its params must pass the tool's schema. The browser's checks can be bypassed, so these can't.
 */
export async function runMutation(
  tool: string,
  params: Record<string, unknown>,
  tools: ToolRegistry,
  handlers: Readonly<Record<string, ToolHandler>>,
): Promise<MutationAnswer> {
  const schema = Object.hasOwn(tools, tool) ? tools[tool] : undefined;
  const handler = Object.hasOwn(handlers, tool) ? handlers[tool] : undefined;
  if (schema === undefined || handler === undefined) {
    return { status: 403, body: errorBody("unknown_tool", `"${tool}" is not a permitted action.`), outcome: "unknown_tool" };
  }

  const reserved = RESERVED_KEYS.filter((key) => Object.hasOwn(params, key));
  const parsed = reserved.length === 0 ? schema.safeParse(params) : null;
  if (parsed === null || !parsed.success) {
    const issues = parsed
      ? parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      : reserved.map((key) => ({ path: key, message: "reserved key" }));
    const body: ApiErrorBody = { error: { code: "invalid_params", message: "The action's details are not valid.", retryable: false, issues } };
    return { status: 422, body, outcome: "invalid_params", detail: { paths: issues.map((i) => i.path) } };
  }

  try {
    const result = await handler(parsed.data as Record<string, unknown>);
    return { status: 200, body: { ok: true, tool, result }, outcome: "ok" };
  } catch (err) {
    return {
      status: 500,
      body: errorBody("tool_failed", "The action could not be completed.", true),
      outcome: "tool_failed",
      detail: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
