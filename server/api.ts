// The API's rules, shared by the Express app (app.ts) and the in-browser API the hosted playground
// uses (inBrowser.ts), so both answer every request the same way. Imports nothing from Node.
import { z } from "zod";
import { canRead, FORMAT_VERSION, versionMarker, type ToolRegistry } from "@omni-ir/core";
import { ModelError } from "./models/types";
import { sha256 } from "./backend/auth";
import type { User } from "./backend/types";
import { ToolError, type ToolContext, type ToolHandler } from "./tools/handlers";

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
  /** The pressed Button's id, used only to write the result's update for it ([10.35]). */
  button: z.string().max(64).optional(),
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
 * The format a client asked for in the query ([10.1]), checked before streaming ([10.12]): null when the
 * client can read this server's format (or asked for none), otherwise the error to answer with (400).
 * Within 0.x formats only add, so a client reads its own format and every older one.
 */
export function versionError(requested: string | null): ApiErrorBody | null {
  if (requested === null) return null;
  if (!/^\d+\.\d+$/.test(requested)) return errorBody("invalid_request", "version must be MAJOR.MINOR, such as 0.5.");
  if (canRead(requested)) return null;
  return errorBody("unsupported_version", `This server writes Omni-IR format ${FORMAT_VERSION}, newer than ${requested}: the app needs an update.`);
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
  /** For the log and the audit trail: ok, replayed, unknown_tool, sign_in_required, invalid_params, a handler's refusal code, or tool_failed. */
  outcome: string;
  detail?: Record<string, unknown>;
}

export interface MutationRequest {
  tool: string;
  params: Record<string, unknown>;
  /** The signed-in person, if any. */
  user: User | null;
  /** The Idempotency-Key header ([10.14]): null when absent. */
  idempotencyKey: string | null;
  /** The pressed Button's id, if the client sent it ([10.35]). Trusted for nothing but the update. */
  button?: string | undefined;
}

/** Writes the update an action's result carries, from the result and the pressed Button's id ([10.35]). */
export type ActionUpdate = (result: Record<string, unknown>, button: string) => string;

/** An id the update may name: the grammar's identifier ([4.3]), never a reserved word. */
const BUTTON_ID = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const NOT_IDS = new Set(["true", "false", "null", "__proto__", "constructor", "prototype"]);

/** An idempotency key: 1-200 letters, digits and `_-:.` ([10.14]). */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_\-:.]{1,200}$/;

/** JSON with keys sorted, so the same params always give the same fingerprint. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Run a governed action after checking it again (section 9, [10.14]): the tool must be registered
 * and have a handler; a tool for signed-in people needs one; the params must pass the tool's
 * schema. A repeated idempotency key gets the stored answer instead of running the action twice.
 * Every outcome is recorded in the audit trail, without param values. The browser's checks can be
 * bypassed, so none of these can.
 */
export async function runMutation(
  request: MutationRequest,
  {
    tools,
    handlers,
    ctx,
    updates = {},
  }: { tools: ToolRegistry; handlers: Readonly<Record<string, ToolHandler>>; ctx: ToolContext; updates?: Readonly<Record<string, ActionUpdate>> },
): Promise<MutationAnswer> {
  const { tool, params, user, idempotencyKey, button } = request;
  const answer = await decide();
  await ctx.store.audit.add({
    at: ctx.now,
    userId: user?.id ?? null,
    tool: tool.slice(0, 128),
    outcome: answer.outcome,
    idempotencyKey: idempotencyKey !== null && IDEMPOTENCY_KEY.test(idempotencyKey) ? idempotencyKey : null,
  });
  return answer;

  async function decide(): Promise<MutationAnswer> {
    const schema = Object.hasOwn(tools, tool) ? tools[tool] : undefined;
    const handler = Object.hasOwn(handlers, tool) ? handlers[tool] : undefined;
    if (schema === undefined || handler === undefined) {
      return { status: 403, body: errorBody("unknown_tool", `"${tool}" is not a permitted action.`), outcome: "unknown_tool" };
    }
    if (handler.access === "signed-in" && user === null) {
      return { status: 401, body: errorBody("sign_in_required", "Sign in to do this."), outcome: "sign_in_required" };
    }
    if (idempotencyKey !== null && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return { status: 400, body: errorBody("invalid_request", "Idempotency-Key must be 1-200 letters, digits, or _ - : ."), outcome: "invalid_request" };
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
    const valid = parsed.data as Record<string, unknown>;

    // Keys are kept per person, so one person's key can never return another person's answer.
    // Public actions (only the sign-in link) are safe to repeat and don't use keys.
    const keyed = idempotencyKey !== null && user !== null ? { scope: user.id, key: idempotencyKey } : null;
    if (keyed) {
      const fingerprint = await sha256(`${tool}\n${stableJson(valid)}`);
      const held = await ctx.store.idempotency.claim(keyed.scope, keyed.key, fingerprint, ctx.now);
      if (held.state === "done") return { status: held.status, body: held.body, outcome: "replayed" };
      if (held.state === "pending") {
        return { status: 409, body: errorBody("idempotency_in_progress", "This action is still running.", true), outcome: "idempotency_in_progress" };
      }
      if (held.state === "conflict") {
        return { status: 409, body: errorBody("idempotency_conflict", "This key was already used for a different action."), outcome: "idempotency_conflict" };
      }
    }

    let result: MutationAnswer;
    try {
      const output =
        handler.access === "public" ? await handler.run(valid, { ...ctx, user }) : await handler.run(valid, { ...ctx, user: user as User });
      // The update is the app's own text, written by its code for the pressed Button ([10.35]).
      const write = Object.hasOwn(updates, tool) ? updates[tool] : undefined;
      const update = write && button !== undefined && BUTTON_ID.test(button) && !NOT_IDS.has(button) ? write(output, button) : undefined;
      result = { status: 200, body: { ok: true, tool, result: output, ...(update === undefined ? {} : { update }) }, outcome: "ok" };
    } catch (err) {
      if (err instanceof ToolError) {
        result = { status: err.status, body: errorBody(err.code, err.message), outcome: err.code };
      } else {
        // Unexpected: the key is released, so a retry can run the action.
        if (keyed) await ctx.store.idempotency.release(keyed.scope, keyed.key);
        return {
          status: 500,
          body: errorBody("tool_failed", "The action could not be completed.", true),
          outcome: "tool_failed",
          detail: { error: err instanceof Error ? err.message : String(err) },
        };
      }
    }
    if (keyed) await ctx.store.idempotency.finish(keyed.scope, keyed.key, result.status, result.body);
    return result;
  }
}
