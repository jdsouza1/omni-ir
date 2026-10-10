// Updates (SPEC.md [10.29]-[10.34]): Omni-IR text from the app's own code that changes a screen after
// its stream has ended. The same lines as a stream; an id or $key the screen has is replaced instead of
// being a duplicate. An update is checked on its own lines, then as the whole screen it would leave,
// and applied whole or not at all. This module only decides; the parser applies the result.
import { LineBuffer } from "./lineBuffer.js";
import { boundKey, isMutating, ROOT_ID, stateKeysOf, validateDocument, validateStatement, type Statement, type ValidationContext } from "./schema.js";
import { parseLine } from "./tokenizer.js";
import type { Issue } from "./types.js";

/** At most this many lines in one update, blank and comment lines included ([10.30]). */
export const MAX_UPDATE_LINES = 2000;

export interface UpdateResult {
  /** Whether the update changed the screen. A rejected update changes nothing ([10.33]). */
  applied: boolean;
  /** Errors and warnings, with `line` counting from 1 in the update. */
  issues: Issue[];
}

export type UpdatePlan =
  | { ok: false; issues: Issue[] }
  | {
      ok: true;
      issues: Issue[];
      /** The screen's statements after the update, in order ([10.32]). */
      statements: Statement[];
      /** What the update assigned and the screen kept, by id or $key. */
      assigned: Statement[];
      /** Ids of components and McpMutations the update took off the screen ([10.31]). */
      removed: string[];
      /** The screen's document errors after the update, the baseline for the next one. */
      documentIssues: Issue[];
    };

const keyOf = (s: Statement) => (s.kind === "state" ? s.key : s.id);
const issueKey = (i: Issue) => `${i.code}\u0000${i.id ?? ""}`;

/**
 * Decide what an update does to a screen. `current` is the screen's statements in order and
 * `baseline` the document errors it already has (they don't stop an update, [10.33]).
 */
export function planUpdate(current: readonly Statement[], baseline: readonly Issue[], text: string, ctx: ValidationContext, maxLineLength?: number): UpdatePlan {
  const buffer = new LineBuffer(maxLineLength === undefined ? {} : { maxLineLength });
  const events = [...buffer.push(text), ...buffer.end()];
  if (events.length > MAX_UPDATE_LINES) {
    return { ok: false, issues: [{ code: "update_too_large", message: `an update may hold at most ${MAX_UPDATE_LINES} lines (this one has ${events.length})` }] };
  }

  // Each line on its own: grammar, catalog, props, tools, pictures ([10.32]); each id once ([10.30]).
  const issues: Issue[] = [];
  const assigned: Statement[] = [];
  const lineOf = new Map<string, number>();
  for (const event of events) {
    const { line } = event;
    if (event.kind === "overflow") {
      issues.push({ code: "line_too_long", message: `line is longer than the limit (${event.length} characters seen)`, line });
      continue;
    }
    const parsed = parseLine(event.text);
    if (parsed.kind === "empty") continue;
    if (parsed.kind === "error") {
      issues.push(...parsed.issues.map((issue) => ({ ...issue, line })));
      continue;
    }
    issues.push(...parsed.warnings.map((issue) => ({ ...issue, line })));
    const result = validateStatement(parsed.statement, ctx);
    if (!result.ok) {
      issues.push(...result.issues.map((issue) => ({ ...issue, line })));
      continue;
    }
    const key = keyOf(result.statement);
    if (lineOf.has(key)) {
      issues.push({ code: "duplicate_id", message: `${key} is assigned more than once in this update`, id: key, line });
      continue;
    }
    lineOf.set(key, line);
    assigned.push(result.statement);
  }
  const failed = () => issues.some((issue) => issue.code !== "unknown_escape" && issue.code !== "newer_version");
  if (failed()) return { ok: false, issues };

  // The screen it would leave: replaced lines keep their place, new ones follow in order ([10.32]).
  const byKey = new Map<string, Statement>(current.map((s) => [keyOf(s), s]));
  for (const s of assigned) byKey.set(keyOf(s), s);

  // What the person enters belongs to them: no $key a field reads, before or after ([10.34]).
  const readByField = new Set<string>();
  for (const s of [...current, ...byKey.values()]) {
    if (s.kind !== "node") continue;
    const key = boundKey(s);
    if (key !== undefined) readByField.add(key);
  }
  const existing = new Set(current.flatMap((s) => (s.kind === "state" ? [s.key] : [])));
  for (const s of assigned) {
    if (s.kind === "state" && existing.has(s.key) && readByField.has(s.key)) {
      issues.push({ code: "live_field_conflict", message: `${s.key} is read by a field, so an update can't change it`, id: s.key, line: lineOf.get(s.key) });
    }
  }
  if (failed()) return { ok: false, issues };

  // Keep only what root reaches, and McpMutations whose targets stay Buttons with an action ([10.31]).
  const reachable = new Set<string>();
  const stack = [ROOT_ID];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const s = byKey.get(id);
    if (reachable.has(id) || s?.kind !== "node") continue;
    reachable.add(id);
    for (let n = s.children.length - 1; n >= 0; n--) stack.push(s.children[n]!);
  }
  const governs = (target: string) => {
    const t = byKey.get(target);
    return reachable.has(target) && t?.kind === "node" && isMutating(t);
  };
  const statements = [...byKey.values()].filter((s) => s.kind === "state" || (s.kind === "node" ? reachable.has(s.id) : governs(s.target)));
  const kept = new Set(statements.map(keyOf));

  // The whole screen, as at end of stream; only errors it didn't have stop the update ([10.33]).
  const documentIssues = validateDocument(statements, { complete: true });
  const before = new Set(baseline.map(issueKey));
  for (const issue of documentIssues) {
    if (before.has(issueKey(issue))) continue;
    const line = issue.id === undefined ? undefined : lineOf.get(issue.id);
    issues.push(line === undefined ? issue : { ...issue, line });
  }
  if (failed()) return { ok: false, issues };

  return {
    ok: true,
    issues,
    statements,
    assigned: assigned.filter((s) => kept.has(keyOf(s))),
    removed: current.filter((s) => s.kind !== "state" && !kept.has(s.id)).map((s) => keyOf(s)),
    documentIssues,
  };
}

/** The references a screen's components and McpMutations make that nothing defines (for `missing`). */
export function missingReferences(statements: readonly Statement[]): string[] {
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const s of statements) (s.kind === "state" ? keys : ids).add(keyOf(s));
  const missing = new Set<string>();
  for (const s of statements) {
    if (s.kind === "state") continue;
    if (s.kind === "node") for (const child of s.children) if (!ids.has(child)) missing.add(child);
    for (const key of stateKeysOf(s)) if (!keys.has(key)) missing.add(key);
  }
  return [...missing];
}
