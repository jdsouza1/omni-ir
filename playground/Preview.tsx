// The live preview, plus the preview half of source ↔ preview highlighting. Hovering or focusing a
// rendered component reports its IR id (the innermost one); the highlighted id gets an outline.
// Only a data attribute is toggled on the rendered element; its content is never touched.
import { useEffect, useRef } from "react";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import type { OmniStore } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import type { MutationCall, RendererEvent } from "@omni-ir/react";

export interface PreviewProps {
  runId: number;
  store: OmniStore | null;
  onMutation: (call: MutationCall) => void | Promise<void>;
  onEvent: (event: RendererEvent) => void;
  highlightedId: string | null;
  onHighlight: (id: string | null) => void;
  /** Changes whenever new content may have rendered, so the highlight is re-applied. */
  revision: unknown;
}

const HIGHLIGHT = "data-pg-highlight";

/** The rendered screen follows the page: its explicit data-theme if it has one, otherwise the device's setting. */
function pageTheme(): "light" | "dark" | "system" {
  const chosen = typeof document === "undefined" ? undefined : document.documentElement.dataset.theme;
  return chosen === "light" || chosen === "dark" ? chosen : "system";
}

export function Preview({ runId, store, onMutation, onEvent, highlightedId, onHighlight, revision }: PreviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const el of root.querySelectorAll(`[${HIGHLIGHT}]`)) el.removeAttribute(HIGHLIGHT);
    // Ids are validated identifiers ([A-Za-z_][A-Za-z0-9_]*), so they are safe inside a selector.
    if (highlightedId) root.querySelector(`[data-node-id="${highlightedId}"]`)?.setAttribute(HIGHLIGHT, "true");
  }, [highlightedId, revision, runId]);

  const idAt = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null) : null;

  if (!store) return <p className="pg-muted">The rendered screen appears here as it streams.</p>;
  return (
    <div
      ref={ref}
      className="pg-preview-canvas"
      onMouseOver={(e) => onHighlight(idAt(e.target))}
      onMouseLeave={() => onHighlight(null)}
      onFocus={(e) => onHighlight(idAt(e.target))}
      onBlur={() => onHighlight(null)}
    >
      <OmniRenderer key={runId} store={store} tools={TOOLS} assets={ASSETS} onMutation={onMutation} onEvent={onEvent} theme={pageTheme()} />
    </div>
  );
}
