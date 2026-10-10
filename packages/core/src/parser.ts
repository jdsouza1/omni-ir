// Streaming parser: chunks → lines (R2) → raw statements (R4) → schema validation → store.
// A bad line is reported and skipped; it never stops the stream.
import { LineBuffer, type LineEvent } from "./lineBuffer.js";
import type { AppComponents, PicturePattern } from "./appComponents.js";
import { DocumentIndex, validateDocument, validateStatement, type Statement, type ToolRegistry, type ValidationContext } from "./schema.js";
import { createStore, type OmniDocument, type OmniStore } from "./store.js";
import { parseLine } from "./tokenizer.js";
import type { Issue } from "./types.js";
import { FORMAT_VERSION, isNewerMarker } from "./version.js";
import { missingReferences, planUpdate, type UpdateResult } from "./updates.js";

export type ParserEvent =
  | { type: "node"; id: string; line: number }
  | { type: "pending"; id: string; line: number }
  | { type: "resolved"; id: string; line: number }
  | { type: "warning"; issue: Issue }
  | { type: "error"; issue: Issue }
  | { type: "end"; issues: Issue[] }
  /** An update after the stream ended ([10.29]), applied whole or not at all; its issues count lines from 1 in the update. */
  | { type: "update"; applied: boolean; issues: Issue[] };

export interface ParserOptions {
  tools: ToolRegistry;
  /** The app's image asset registry (only its names are used here). Without it, no Image is accepted. */
  assets?: Readonly<Record<string, unknown>>;
  /** Families of picture names looked up when a screen is drawn, such as `product-{id}` (Step 20). */
  pictures?: readonly PicturePattern[];
  /** The app's own components (Step 20, `defineComponents`). */
  components?: AppComponents;
  store?: OmniStore;
  maxLineLength?: number;
}

export interface OmniParser {
  readonly store: OmniStore;
  write(chunk: string | Uint8Array): void;
  /** Flush the last line, run the whole-document check and mark missing references. */
  end(): Issue[];
  subscribe(listener: (event: ParserEvent) => void): () => void;
  getSnapshot(): OmniDocument;
  /**
   * Apply an update from the app's own code to the ended screen (SPEC.md [10.29]-[10.34]): the same
   * lines as a stream, where an id or $key the screen has is replaced. Applied whole or not at all.
   * Never pass text a model wrote. Throws if the stream hasn't ended.
   */
  update(text: string): UpdateResult;
}

export function createParser(options: ParserOptions): OmniParser {
  const store = options.store ?? createStore();
  const ctx: ValidationContext = { tools: options.tools, assets: Object.keys(options.assets ?? {}) };
  if (options.pictures !== undefined) ctx.pictures = options.pictures;
  if (options.components !== undefined) ctx.components = options.components;
  const buffer = new LineBuffer(options.maxLineLength === undefined ? {} : { maxLineLength: options.maxLineLength });
  let accepted: Statement[] = [];
  let screenIssues: Issue[] = [];
  const index = new DocumentIndex();
  const lineOf = new Map<string, number>();
  const listeners = new Set<(event: ParserEvent) => void>();
  let endIssues: Issue[] | null = null;

  const emit = (event: ParserEvent) => {
    for (const listener of listeners) listener(event);
  };
  const reject = (issues: Issue[], line: number) => {
    for (const issue of issues) emit({ type: "error", issue: { ...issue, line } });
  };

  function handle(event: LineEvent) {
    const { line } = event;
    if (event.kind === "overflow") {
      reject([{ code: "line_too_long", message: `line is longer than the limit (${event.length} characters seen)` }], line);
      return;
    }

    if (line === 1 && isNewerMarker(event.text)) {
      const message = `the stream was written for a newer Omni-IR format than this parser's (${FORMAT_VERSION})`;
      emit({ type: "warning", issue: { code: "newer_version", message, line } });
      store.markNewerVersion?.();
    }

    const parsed = parseLine(event.text);
    if (parsed.kind === "empty") return;
    if (parsed.kind === "error") return reject(parsed.issues, line);
    for (const warning of parsed.warnings) emit({ type: "warning", issue: { ...warning, line } });

    const result = validateStatement(parsed.statement, ctx);
    if (!result.ok) return reject(result.issues, line);
    const statement = result.statement;

    // The accepted statements are always consistent, so any new issue is caused by this line. The
    // index checks only what the line touches, so a long stream stays linear (PLAN-HARDENING.md C.2).
    const conflicts = index.check(statement);
    if (conflicts.length > 0) return reject(conflicts, line);

    accepted.push(statement);
    index.add(statement);
    const id = statement.kind === "state" ? statement.key : statement.id;
    lineOf.set(id, line);
    const { pending, resolved } = store.apply(statement);
    emit({ type: "node", id, line });
    for (const ref of resolved) emit({ type: "resolved", id: ref, line });
    for (const ref of pending) emit({ type: "pending", id: ref, line });
  }

  return {
    store,

    write(chunk) {
      if (endIssues !== null) throw new Error("OmniParser: write() after end()");
      for (const event of buffer.push(chunk)) handle(event);
    },

    end() {
      if (endIssues !== null) return endIssues;
      for (const event of buffer.end()) handle(event);
      const issues = validateDocument(accepted, { complete: true }).map((issue) => {
        const line = issue.id === undefined ? undefined : lineOf.get(issue.id);
        return line === undefined ? issue : { ...issue, line };
      });
      endIssues = issues;
      screenIssues = validateDocument(accepted, { complete: true });
      store.finish();
      for (const issue of issues) emit({ type: "error", issue });
      emit({ type: "end", issues });
      return issues;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => store.getSnapshot(),

    update(text) {
      if (endIssues === null) throw new Error("OmniParser: update() before end(); updates change an ended screen ([10.29])");
      const plan = planUpdate(accepted, screenIssues, text, ctx, options.maxLineLength);
      if (plan.ok) {
        const targets = new Map(accepted.flatMap((s) => (s.kind === "mutation" ? [[s.id, s.target] as const] : [])));
        accepted = plan.statements;
        screenIssues = plan.documentIssues;
        store.applyUpdate?.({
          assigned: plan.assigned,
          removed: plan.removed.map((id) => {
            const target = targets.get(id);
            return target === undefined ? { id } : { id, target };
          }),
          missing: missingReferences(plan.statements),
        });
      }
      const result = { applied: plan.ok, issues: plan.issues };
      emit({ type: "update", ...result });
      return result;
    },
  };
}

/** Parse a whole async stream (e.g. an SSE body or LLM token stream) and end it. */
export async function parseStream(
  source: AsyncIterable<string | Uint8Array>,
  options: ParserOptions,
): Promise<{ parser: OmniParser; issues: Issue[] }> {
  const parser = createParser(options);
  for await (const chunk of source) parser.write(chunk);
  return { parser, issues: parser.end() };
}
