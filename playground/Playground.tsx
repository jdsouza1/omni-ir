// Playground shell (Task A): confirms the page and the in-process API are wired. Filled in by Tasks C–F.
import { useEffect, useState } from "react";

export function Playground() {
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<{ model: string }>)
      .then((h) => setModel(h.model))
      .catch(() => setModel("unreachable"));
  }, []);
  return (
    <main className="pg">
      <h1 className="pg-title">Omni-IR Playground</h1>
      <p className="pg-muted" role="status">
        {model === null ? "Connecting…" : `API: ${model}`}
      </p>
    </main>
  );
}
