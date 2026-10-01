// Renderer-owned, not part of the catalog: the stream can never produce it (R5, R7).

export type FallbackReason = "missing" | "crashed";

const MESSAGES: Record<FallbackReason, string> = {
  missing: "Component failed to load",
  crashed: "Component failed to render",
};

export function NodeFallback({ id, reason }: { id: string; reason: FallbackReason }) {
  return (
    <div className="omni-fallback" role="note" data-fallback-reason={reason} data-node-id={id}>
      {MESSAGES[reason]}
    </div>
  );
}
