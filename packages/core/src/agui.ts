// Omni-IR over AG-UI 1.0 (SPEC.md [10.18]-[10.20]), the event protocol many agent frameworks speak.
// A screen is one activity message of type "omni-ir": a snapshot with no lines, then one JSON Patch
// per complete line that only ever appends. Published as `@omni-ir/core/ag-ui`, with its own types,
// so the package gains no dependency.
//
// AgUiEncoder (for an agent backend): text in, AG-UI events out.
// createAgUiReader (for an app with an AG-UI client): events in, lines written to an Omni-IR parser.
// Governed actions never travel this way: they go to the app's own action endpoint ([10.20]).
import type { OmniParser } from "./parser.js";
import { FORMAT_VERSION, versionMarker } from "./version.js";

/** The activity type of an Omni-IR screen. */
export const OMNI_ACTIVITY_TYPE = "omni-ir";

/** Any AG-UI event: a JSON object with a `type`, such as "ACTIVITY_DELTA". */
export interface AgUiEvent {
  type: string;
  [field: string]: unknown;
}

const APPEND = "/lines/-";

export interface AgUiEncoderOptions {
  threadId: string;
  runId: string;
  /** The activity message's id; one per screen. */
  messageId: string;
  /** The Omni-IR format the text is written for, MAJOR.MINOR. Defaults to this package's format. */
  version?: string;
}

/**
 * Turns an Omni-IR text stream into AG-UI events: `start()`, then `write()` for each piece of text as
 * it arrives (pieces may end anywhere), then `finish()` or `fail()`. Each call returns the events to
 * send, in order. Write the model's text only: the version travels in the snapshot, not as a line.
 */
export class AgUiEncoder {
  private buffer = "";
  private ended = false;

  constructor(private readonly options: AgUiEncoderOptions) {}

  start(): AgUiEvent[] {
    const { threadId, runId, messageId, version = FORMAT_VERSION } = this.options;
    return [
      { type: "RUN_STARTED", threadId, runId },
      { type: "ACTIVITY_SNAPSHOT", messageId, activityType: OMNI_ACTIVITY_TYPE, content: { version, lines: [] } },
    ];
  }

  write(text: string): AgUiEvent[] {
    if (this.ended) return [];
    this.buffer += text;
    const events: AgUiEvent[] = [];
    let end = this.buffer.indexOf("\n");
    while (end !== -1) {
      events.push(this.line(this.buffer.slice(0, end)));
      this.buffer = this.buffer.slice(end + 1);
      end = this.buffer.indexOf("\n");
    }
    return events;
  }

  /** The stream is complete: the last line, even without a line ending, then RUN_FINISHED. */
  finish(): AgUiEvent[] {
    if (this.ended) return [];
    const events = this.flush();
    events.push({ type: "RUN_FINISHED", threadId: this.options.threadId, runId: this.options.runId });
    return events;
  }

  /** The stream failed: the lines that arrived stay, then RUN_ERROR. */
  fail(message: string, code?: string): AgUiEvent[] {
    if (this.ended) return [];
    const events = this.flush();
    events.push({ type: "RUN_ERROR", message, ...(code === undefined ? {} : { code }) });
    return events;
  }

  private flush(): AgUiEvent[] {
    this.ended = true;
    const rest = this.buffer;
    this.buffer = "";
    return rest === "" ? [] : [this.line(rest)];
  }

  private line(text: string): AgUiEvent {
    const value = text.endsWith("\r") ? text.slice(0, -1) : text;
    return { type: "ACTIVITY_DELTA", messageId: this.options.messageId, activityType: OMNI_ACTIVITY_TYPE, patch: [{ op: "add", path: APPEND, value }] };
  }
}

/** How a run ended, once RUN_FINISHED or RUN_ERROR has arrived. */
export type AgUiOutcome = { status: "done" } | { status: "error"; message: string; code?: string };

/** What the reader did with one event: nothing to report, or an event it refused (and ignored). */
export interface AgUiFeedResult {
  error?: string;
}

export interface AgUiReader {
  /** Feed every AG-UI event of the run, in order; those that aren't about this screen are ignored. */
  feed(event: AgUiEvent | Record<string, unknown>): AgUiFeedResult;
  /** Set when the run has ended; the parser has then been ended too. */
  readonly outcome: AgUiOutcome | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Feeds an Omni-IR parser from AG-UI events ([10.19]). The first "omni-ir" snapshot picks the screen;
 * lines can only be added, so a patch that replaces, removes or moves a line, or a snapshot that
 * rewrites lines already received, is refused and changes nothing. RUN_FINISHED or RUN_ERROR ends
 * the parser; everything after is ignored.
 */
export function createAgUiReader(parser: OmniParser): AgUiReader {
  let messageId: string | null = null;
  /** The lines received so far, to check that a later snapshot only adds to them. */
  const sent: string[] = [];
  let outcome: AgUiOutcome | null = null;

  const write = (lines: readonly string[]) => {
    for (const line of lines) {
      parser.write(`${line}\n`);
      sent.push(line);
    }
  };
  const refuse = (error: string): AgUiFeedResult => ({ error });

  return {
    get outcome() {
      return outcome;
    },

    feed(event) {
      if (outcome !== null) return {};
      switch (event.type) {
        case "RUN_FINISHED":
        case "RUN_ERROR":
          outcome =
            event.type === "RUN_FINISHED"
              ? { status: "done" }
              : { status: "error", message: typeof event.message === "string" ? event.message : "The run failed.", ...(typeof event.code === "string" ? { code: event.code } : {}) };
          parser.end();
          return {};

        case "ACTIVITY_SNAPSHOT": {
          if (event.activityType !== OMNI_ACTIVITY_TYPE) return {};
          if (messageId !== null && event.messageId !== messageId) return {}; // another screen
          if (event.replace === false) return {};
          const content = isRecord(event.content) ? event.content : {};
          const lines = content.lines;
          if (typeof event.messageId !== "string" || !isStrings(lines)) return refuse("an omni-ir snapshot needs content {version, lines: [strings]}");
          if (messageId === null) {
            messageId = event.messageId;
            if (typeof content.version === "string" && /^\d+\.\d+$/.test(content.version)) parser.write(`${versionMarker(content.version)}\n`);
            write(lines);
            return {};
          }
          // A later snapshot, as middleware that merges deltas sends: it may only add lines.
          if (lines.length < sent.length || sent.some((line, k) => lines[k] !== line)) {
            return refuse("a snapshot may not change lines already received");
          }
          write(lines.slice(sent.length));
          return {};
        }

        case "ACTIVITY_DELTA": {
          if (messageId === null || event.messageId !== messageId) return {};
          if (event.activityType !== OMNI_ACTIVITY_TYPE) return refuse("an omni-ir message can't change its activity type");
          const patch = event.patch;
          if (!Array.isArray(patch)) return refuse("a delta needs a patch");
          const lines: string[] = [];
          for (const op of patch) {
            if (!isRecord(op) || op.op !== "add" || op.path !== APPEND) return refuse("only adding a line at /lines/- is allowed");
            if (typeof op.value !== "string") return refuse("a line must be a string");
            lines.push(op.value);
          }
          write(lines);
          return {};
        }

        default:
          return {};
      }
    },
  };
}
