// Playground state: one "run" per prompt or paste. Each run owns a fresh parser, the raw source
// text as it arrived, per-line issues, which line defined each node, and an event log. Updates from
// an older run (e.g. a cancelled one finishing late) are ignored.
import { useCallback, useMemo, useReducer, useRef } from "react";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { generate as defaultGenerate, type GenerateClientOptions, type GenerateOutcome } from "@omni-ir/react";
import { createMutationHandler } from "@omni-ir/react";
import { createParser, type OmniParser, type ParserEvent } from "@omni-ir/core";
import type { MutationCall, RendererEvent } from "@omni-ir/react";

export type RunStatus =
  | { kind: "idle" }
  | { kind: "streaming" }
  | { kind: "done"; stopReason: "end_turn" | "max_tokens" | "refusal"; model: string; ms: number }
  | { kind: "error"; code: string; message: string; retryable: boolean }
  | { kind: "cancelled" };

export interface LineIssue {
  line: number | undefined;
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface LogEntry {
  seq: number;
  ms: number;
  kind: string;
  text: string;
  tone: "info" | "warning" | "error";
}

export interface ActionEntry {
  seq: number;
  node: string;
  status: "ok" | "refused" | "blocked" | "local";
  detail: string;
}

export interface PlaygroundState {
  runId: number;
  mode: "prompt" | "paste";
  parser: OmniParser | null;
  source: string;
  status: RunStatus;
  issues: LineIssue[];
  /** Which source line defined each node id (and $state key). */
  nodeLines: Readonly<Record<string, number>>;
  log: LogEntry[];
  actions: ActionEntry[];
  lastPrompt: string;
}

type Action =
  | { type: "start"; runId: number; parser: OmniParser; mode: "prompt" | "paste"; prompt?: string }
  | { type: "text"; runId: number; text: string }
  | { type: "parser"; runId: number; event: ParserEvent; ms: number }
  | { type: "outcome"; runId: number; outcome: GenerateOutcome }
  | { type: "renderer"; runId: number; event: RendererEvent; ms: number }
  | { type: "result"; runId: number; call: MutationCall; result: Record<string, unknown> };

const LOG_LIMIT = 500;

export const INITIAL_STATE: PlaygroundState = {
  runId: 0,
  mode: "prompt",
  parser: null,
  source: "",
  status: { kind: "idle" },
  issues: [],
  nodeLines: {},
  log: [],
  actions: [],
  lastPrompt: "",
};

let seq = 0;
const addLog = (log: LogEntry[], entry: Omit<LogEntry, "seq">) => [...log, { ...entry, seq: ++seq }].slice(-LOG_LIMIT);

export function reducer(state: PlaygroundState, action: Action): PlaygroundState {
  if (action.type === "start") {
    return {
      ...INITIAL_STATE,
      runId: action.runId,
      mode: action.mode,
      parser: action.parser,
      status: { kind: "streaming" },
      lastPrompt: action.prompt ?? state.lastPrompt,
    };
  }
  if (action.runId !== state.runId) return state; // a stale run

  switch (action.type) {
    case "text":
      return { ...state, source: state.source + action.text };
    case "parser": {
      const e = action.event;
      const ms = action.ms;
      switch (e.type) {
        case "node":
          return {
            ...state,
            nodeLines: { ...state.nodeLines, [e.id]: e.line },
            log: addLog(state.log, { ms, kind: "node", text: `${e.id} (line ${e.line})`, tone: "info" }),
          };
        case "pending":
          return { ...state, log: addLog(state.log, { ms, kind: "pending", text: `${e.id} → placeholder`, tone: "info" }) };
        case "resolved":
          return { ...state, log: addLog(state.log, { ms, kind: "resolved", text: e.id, tone: "info" }) };
        case "warning":
        case "error": {
          const severity = e.type;
          const issue: LineIssue = { line: e.issue.line, severity, code: e.issue.code, message: e.issue.message };
          return {
            ...state,
            issues: [...state.issues, issue],
            log: addLog(state.log, { ms, kind: severity, text: `${e.issue.code}: ${e.issue.message}`, tone: severity }),
          };
        }
        case "end":
          return { ...state, log: addLog(state.log, { ms, kind: "end", text: `${e.issues.length} end-of-stream issue(s)`, tone: "info" }) };
      }
      return state;
    }
    case "outcome": {
      const o = action.outcome;
      const status: RunStatus =
        o.status === "done"
          ? { kind: "done", stopReason: o.stopReason, model: o.model, ms: o.ms }
          : o.status === "aborted"
            ? { kind: "cancelled" }
            : { kind: "error", code: o.code, message: o.message, retryable: o.retryable };
      return { ...state, status };
    }
    case "renderer": {
      const e = action.event;
      if (e.type === "press") {
        return {
          ...state,
          actions: [...state.actions, { seq: ++seq, node: e.id, status: "local", detail: "Local button: nothing sent to the server." }],
        };
      }
      const code = e.issue.code;
      const status = code === "handler_failed" ? "refused" : code === "mutation_blocked" ? "blocked" : null;
      return {
        ...state,
        actions: status ? [...state.actions, { seq: ++seq, node: e.issue.id ?? "?", status, detail: e.issue.message }] : state.actions,
        log: addLog(state.log, { ms: action.ms, kind: "renderer", text: `${code}: ${e.issue.message}`, tone: "error" }),
      };
    }
    case "result":
      return {
        ...state,
        actions: [
          ...state.actions,
          { seq: ++seq, node: action.call.target, status: "ok", detail: `${action.call.tool} → ${JSON.stringify(action.result)}` },
        ],
      };
  }
}

export interface PlaygroundDeps {
  generate?: (prompt: string, options: GenerateClientOptions) => Promise<GenerateOutcome>;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function usePlayground(deps: PlaygroundDeps = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const runRef = useRef({ id: 0, controller: null as AbortController | null, started: 0 });
  const generateFn = deps.generate ?? defaultGenerate;
  const baseUrl = deps.baseUrl ?? "";

  /** A fresh parser for a new run, with its events and raw text routed to this run only. */
  const beginRun = useCallback((mode: "prompt" | "paste", prompt?: string) => {
    runRef.current.controller?.abort();
    const runId = ++runRef.current.id;
    const started = performance.now();
    runRef.current.started = started;
    const inner = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    inner.subscribe((event) => dispatch({ type: "parser", runId, event, ms: Math.round(performance.now() - started) }));
    // Record the raw text exactly as it arrives, then parse it.
    const parser: OmniParser = {
      store: inner.store,
      write: (chunk) => {
        if (typeof chunk === "string") dispatch({ type: "text", runId, text: chunk });
        inner.write(chunk);
      },
      end: () => inner.end(),
      subscribe: (listener) => inner.subscribe(listener),
      getSnapshot: () => inner.getSnapshot(),
      update: (text) => inner.update(text),
    };
    dispatch({ type: "start", runId, parser, mode, ...(prompt !== undefined ? { prompt } : {}) });
    return { runId, parser };
  }, []);

  const run = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const { runId, parser } = beginRun("prompt", trimmed);
      const controller = new AbortController();
      runRef.current.controller = controller;
      const outcome = await generateFn(trimmed, {
        parser,
        signal: controller.signal,
        baseUrl,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
      });
      dispatch({ type: "outcome", runId, outcome });
    },
    [beginRun, generateFn, baseUrl, deps.fetch],
  );

  const renderSource = useCallback(
    (text: string) => {
      const { runId, parser } = beginRun("paste");
      parser.write(text);
      parser.end();
      dispatch({ type: "outcome", runId, outcome: { status: "done", stopReason: "end_turn", model: "paste", ms: 0 } });
    },
    [beginRun],
  );

  const cancel = useCallback(() => runRef.current.controller?.abort(), []);

  const retry = useCallback(() => run(state.lastPrompt), [run, state.lastPrompt]);

  const onMutation = useMemo(
    () =>
      createMutationHandler({
        baseUrl,
        ...(deps.fetch ? { fetch: deps.fetch } : {}),
        onResult: (call, result) => dispatch({ type: "result", runId: runRef.current.id, call, result }),
      }),
    [baseUrl, deps.fetch],
  );

  const onRendererEvent = useCallback(
    (event: RendererEvent) =>
      dispatch({ type: "renderer", runId: runRef.current.id, event, ms: Math.round(performance.now() - runRef.current.started) }),
    [],
  );

  return { state, run, renderSource, cancel, retry, onMutation, onRendererEvent };
}
