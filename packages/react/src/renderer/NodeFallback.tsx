// Renderer-owned, not part of the catalog: the stream can never produce it (R5, R7).
import { useContext } from "react";
import { ENGLISH } from "../catalog/strings.js";
import { OmniContext } from "./context.js";

/** Never arrived, crashed while drawing, or an app component with no view on this platform. */
export type FallbackReason = "missing" | "crashed" | "unsupported";

export function NodeFallback({ id, reason }: { id: string; reason: FallbackReason }) {
  // Inside a renderer, the app's words; on its own, English.
  const strings = useContext(OmniContext)?.strings ?? ENGLISH;
  return (
    <div className="omni-fallback" role="note" data-fallback-reason={reason} data-node-id={id}>
      {reason === "missing" ? strings.failedToLoad : reason === "unsupported" ? strings.unsupported : strings.failedToRender}
    </div>
  );
}
