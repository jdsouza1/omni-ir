// The Omni-IR playground page. State lives in usePlayground; this file is presentation only, so the
// UX design (Task G) can restyle or rearrange it without touching behaviour.
import { useEffect, useId, useState } from "react";
import { ActionsPanel, EventLog } from "./Panels";
import { Preview } from "./Preview";
import { SourceView } from "./SourceView";
import { usePlayground, type PlaygroundDeps, type RunStatus } from "./usePlayground";

export const EXAMPLE_PROMPTS = [
  "a payment confirmation for $42.50",
  "a sign-in page",
  "edit my profile",
  "where is my order?",
  "contact support",
];

export const ERROR_DEMOS = [
  "demo: unknown tool",
  "demo: missing child",
  "demo: missing mutation",
  "demo: windows path",
  "demo: cut off",
  "demo: model error",
];

const PASTE_STARTER = `root = Card([title, body])
title = Heading("Hello")
body = Text("Edit these lines and press Render.")`;

export function Playground(deps: PlaygroundDeps) {
  const pg = usePlayground(deps);
  const { state } = pg;
  const [mode, setMode] = useState<"prompt" | "paste">("prompt");
  const [prompt, setPrompt] = useState("");
  const [pasted, setPasted] = useState(PASTE_STARTER);
  const [apiModel, setApiModel] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const streaming = state.status.kind === "streaming";
  const promptId = useId();
  const pasteId = useId();

  useEffect(() => {
    let live = true;
    (deps.fetch ?? fetch)(`${deps.baseUrl ?? ""}/api/health`)
      .then((r) => r.json() as Promise<{ model: string }>)
      .then((h) => live && setApiModel(h.model))
      .catch(() => live && setApiModel("unreachable"));
    return () => {
      live = false;
    };
  }, [deps.baseUrl, deps.fetch]);

  // A new run starts with nothing highlighted.
  useEffect(() => setHighlighted(null), [state.runId]);

  const highlightedNode = highlighted ? state.parser?.getSnapshot().nodes.get(highlighted) : undefined;
  const highlightedLine = highlighted ? state.nodeLines[highlighted] : undefined;

  const start = (text: string) => {
    setPrompt(text);
    void pg.run(text);
  };

  return (
    <main className="pg">
      <header className="pg-header">
        <h1 className="pg-title">Omni-IR Playground</h1>
        <span className="pg-badge" title="Which model the server is using">
          {apiModel === null ? "connecting…" : apiModel === "mock" ? "mock model · free" : apiModel}
        </span>
      </header>

      <div className="pg-tabs" role="tablist" aria-label="Input mode">
        {(["prompt", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className="pg-tab"
            onClick={() => setMode(m)}
          >
            {m === "prompt" ? "Describe a screen" : "Paste Omni-IR"}
          </button>
        ))}
      </div>

      {mode === "prompt" ? (
        <section className="pg-controls" aria-label="Prompt controls">
          <form
            className="pg-prompt"
            onSubmit={(e) => {
              e.preventDefault();
              start(prompt);
            }}
          >
            <label htmlFor={promptId} className="pg-label">
              Describe a screen
            </label>
            <div className="pg-row">
              <input
                id={promptId}
                className="pg-input"
                value={prompt}
                maxLength={2000}
                placeholder="e.g. a payment confirmation for $42.50"
                onChange={(e) => setPrompt(e.target.value)}
              />
              {streaming ? (
                <button type="button" className="pg-button pg-button--secondary" onClick={pg.cancel}>
                  Cancel
                </button>
              ) : (
                <button type="submit" className="pg-button" disabled={prompt.trim() === ""}>
                  Generate
                </button>
              )}
            </div>
          </form>
          <Chips label="Examples" prompts={EXAMPLE_PROMPTS} disabled={streaming} onPick={start} />
          <Chips label="Error demos" prompts={ERROR_DEMOS} disabled={streaming} onPick={start} />
        </section>
      ) : (
        <section className="pg-controls" aria-label="Paste controls">
          <label htmlFor={pasteId} className="pg-label">
            Omni-IR lines
          </label>
          <textarea
            id={pasteId}
            className="pg-textarea"
            value={pasted}
            rows={8}
            spellCheck={false}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="pg-row">
            <button type="button" className="pg-button" onClick={() => pg.renderSource(pasted)}>
              Render
            </button>
          </div>
        </section>
      )}

      <p className="pg-status" role="status" aria-live="polite" data-status={state.status.kind}>
        {statusText(state.status, state.source)}
        {state.status.kind === "error" && state.status.retryable && (
          <button type="button" className="pg-link" onClick={() => void pg.retry()}>
            Retry
          </button>
        )}
      </p>

      <div className="pg-panels">
        <section className="pg-panel" aria-label="Omni-IR source">
          <h2 className="pg-panel-title">Source</h2>
          <SourceView
            source={state.source}
            issues={state.issues}
            nodeLines={state.nodeLines}
            streaming={streaming}
            highlightedId={highlighted}
            onHighlight={setHighlighted}
          />
          <p className="pg-caption">
            {highlightedNode && highlightedLine !== undefined
              ? `Line ${highlightedLine} builds ${highlightedNode.type} "${highlighted}"`
              : state.source
                ? "Hover or focus a line to see what it builds."
                : ""}
          </p>
        </section>
        <section className="pg-panel pg-preview" aria-label="Rendered screen">
          <h2 className="pg-panel-title">Preview</h2>
          <Preview
            runId={state.runId}
            store={state.parser?.store ?? null}
            onMutation={pg.onMutation}
            onEvent={pg.onRendererEvent}
            highlightedId={highlighted}
            onHighlight={setHighlighted}
            revision={state.source}
          />
        </section>
      </div>

      <div className="pg-panels">
        <ActionsPanel actions={state.actions} />
        <EventLog log={state.log} />
      </div>
    </main>
  );
}

function Chips({ label, prompts, disabled, onPick }: { label: string; prompts: string[]; disabled: boolean; onPick: (p: string) => void }) {
  return (
    <div className="pg-chips" role="group" aria-label={label}>
      <span className="pg-chips-label">{label}</span>
      {prompts.map((p) => (
        <button key={p} type="button" className="pg-chip" disabled={disabled} onClick={() => onPick(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

export function statusText(status: RunStatus, source: string): string {
  switch (status.kind) {
    case "idle":
      return "Describe a screen, pick an example, or paste Omni-IR.";
    case "streaming": {
      const lines = source === "" ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      return `Generating… ${lines} line${lines === 1 ? "" : "s"} so far`;
    }
    case "done":
      if (status.model === "paste") return "Rendered.";
      if (status.stopReason === "max_tokens") return "The response was cut short. Parts that never arrived are marked in the preview.";
      return `Done in ${status.ms} ms (model: ${status.model}).`;
    case "cancelled":
      return "Cancelled. Parts that hadn't arrived are marked in the preview.";
    case "error":
      return `${status.message} (${status.code})`;
  }
}
