// The Omni-IR playground page. State lives in usePlayground; this file is presentation only, so the
// UX design (Task G) can restyle or rearrange it without touching behaviour.
import { useEffect, useId, useState } from "react";
import { OwnAi, copyText } from "./OwnAiTab";
import { readShareLink, shareLink, summarize, tidyReply } from "./ownAi";
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
  "book a stay",
  "my shopping bag",
  "a trip assistant",
  "a product page",
];

export const ERROR_DEMOS = [
  "demo: unknown tool",
  "demo: missing child",
  "demo: missing mutation",
  "demo: windows path",
  "demo: cut off",
  "demo: model error",
];

/**
 * The hosted playground (built with --mode static) lives inside the site, next to the docs, so it links
 * to the site's own spec page like the landing page does. Run locally there is no docs site: GitHub.
 */
export function specLink(mode: string): { href: string; target?: string; rel?: string } {
  return mode === "static"
    ? { href: "../docs/spec.html" }
    : { href: "https://github.com/jdsouza1/omni-ir/blob/main/SPEC.md", target: "_blank", rel: "noopener noreferrer" };
}
const SPEC_LINK = specLink(import.meta.env.MODE);

/** The step-by-step developer guide: the site's own page when hosted, GitHub when run locally. */
export function guideLink(mode: string): { href: string; target?: string; rel?: string } {
  return mode === "static"
    ? { href: "../docs/guide/getting-started.html" }
    : { href: "https://github.com/jdsouza1/omni-ir/blob/main/site/docs/guide/getting-started.md", target: "_blank", rel: "noopener noreferrer" };
}
const GUIDE_LINK = guideLink(import.meta.env.MODE);

type Mode = "own" | "prompt" | "paste";
const MODE_LABELS: Record<Mode, string> = { own: "Use your own AI", prompt: "Describe a screen", paste: "Paste Omni-IR" };

/** `#own-ai` (the landing page's Get started) or a share link opens the "Use your own AI" tab. */
function linkedMode(): { mode: Mode; shared?: string } {
  if (typeof window === "undefined") return { mode: "prompt" };
  const shared = readShareLink(window.location.hash);
  if (shared !== undefined) return { mode: "own", shared };
  return { mode: window.location.hash === "#own-ai" ? "own" : "prompt" };
}

const PASTE_STARTER = `root = Card([title, body])
title = Heading("Hello")
body = Text("Edit these lines and press Render.")`;

export function Playground(deps: PlaygroundDeps) {
  const pg = usePlayground(deps);
  const { state } = pg;
  const [linked] = useState(linkedMode);
  const [mode, setMode] = useState<Mode>(linked.mode);
  // A link to #own-ai or a shared screen while the playground is already open switches to it too.
  useEffect(() => {
    const onHash = () => {
      const next = linkedMode();
      if (next.mode !== "own") return;
      setMode("own");
      if (next.shared !== undefined) {
        setOpenedShared(true);
        setReply(next.shared);
        showReply(next.shared);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  const [reply, setReply] = useState(linked.shared ?? "");
  const [openedShared, setOpenedShared] = useState(linked.shared !== undefined);
  const [dropped, setDropped] = useState(0);
  const [ownShown, setOwnShown] = useState(false);
  const [frame, setFrame] = useState<"web" | "phone">("web");
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

  const showReply = (text: string) => {
    const tidy = tidyReply(text);
    setDropped(tidy.dropped);
    setOwnShown(true);
    pg.renderSource(tidy.source, { paced: true });
  };

  // A share link shows its screen straight away.
  useEffect(() => {
    if (linked.shared !== undefined) showReply(linked.shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const own = mode === "own";
  const ownDone = own && ownShown && state.status.kind === "done";
  const sourceLines = state.source.split("\n").filter((l) => l.trim() !== "").length;
  const problems = state.issues.filter((i) => i.severity === "error" && !["unknown_tool", "ungoverned_mutation", "mutation_blocked", "mutation_target_not_interactive"].includes(i.code));

  // Show what was checked, with the screen under it, as soon as it's drawn.
  useEffect(() => {
    if (ownDone) document.querySelector(".pg-own-result")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [ownDone, state.runId]);

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
        <span className="pg-logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 2 9 5-9 5-9-5 9-5Z" />
            <path d="m3 12 9 5 9-5" />
            <path d="m3 17 9 5 9-5" />
          </svg>
        </span>
        <h1 className="pg-title">Omni-IR Playground</h1>
        <span className="pg-badge" title="Which model the server is using">
          {apiModel === null ? "connecting…" : apiModel === "mock" ? "mock model · free" : apiModel}
        </span>
        <a className="pg-header-link" {...SPEC_LINK}>
          Read the spec
        </a>
      </header>

      <div className="pg-tabs" role="tablist" aria-label="Input mode">
        {(["own", "prompt", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className="pg-tab"
            onClick={() => setMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {own ? (
        <OwnAi
          reply={reply}
          onReplyChange={setReply}
          onShow={() => showReply(reply)}
          summary={ownDone ? summarize({ lines: sourceLines, issues: state.issues, dropped }) : null}
          problems={problems}
          busy={streaming}
          shared={openedShared}
          guideLink={GUIDE_LINK}
          onShare={async () => {
            const link = shareLink(window.location.href, tidyReply(reply).source);
            if (await copyText(link)) return true;
            window.history.replaceState(null, "", link);
            return false;
          }}
        />
      ) : mode === "prompt" ? (
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

      {(!own || ownShown) && (
      <>
      <p className="pg-status" role="status" aria-live="polite" data-status={state.status.kind}>
        <span className="pg-status-dot" aria-hidden="true" />
        {statusText(state.status, state.source, state.mode)}
        {state.status.kind === "error" && state.status.retryable && (
          <button type="button" className="pg-link" onClick={() => void pg.retry()}>
            Retry
          </button>
        )}
      </p>

      <div className="pg-panels pg-workspace" data-own={own ? "true" : undefined}>
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
          <p className="pg-caption" data-active={highlightedNode ? "true" : undefined}>
            {highlightedNode && highlightedLine !== undefined
              ? `Line ${highlightedLine} builds ${highlightedNode.type} "${highlighted}"`
              : state.source
                ? "Hover or focus a line to see what it builds."
                : ""}
          </p>
        </section>
        <section className="pg-panel pg-preview" aria-label="Rendered screen">
          <div className="pg-panel-head">
            <h2 className="pg-panel-title">Preview</h2>
            {own && (
              <div className="pg-frame-toggle" role="group" aria-label="Show the screen">
                {(["web", "phone"] as const).map((f) => (
                  <button key={f} type="button" className="pg-chip" aria-pressed={frame === f} onClick={() => setFrame(f)}>
                    {f === "web" ? "Web" : "Phone"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Preview
            frame={own ? frame : "web"}
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
        {!own && <EventLog log={state.log} />}
      </div>
      </>
      )}
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

export function statusText(status: RunStatus, source: string, mode: "prompt" | "paste" = "prompt"): string {
  switch (status.kind) {
    case "idle":
      return "Describe a screen, pick an example, or paste Omni-IR.";
    case "streaming": {
      const lines = source === "" ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      // Pasted lines are drawn a line at a time; no model is running.
      return `${mode === "paste" ? "Drawing" : "Generating"}… ${lines} line${lines === 1 ? "" : "s"} so far`;
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
