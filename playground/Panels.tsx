// The actions panel (what governed and local buttons did) and the collapsible event log.
import type { ActionEntry, LogEntry } from "./usePlayground";

const ACTION_LABEL: Record<ActionEntry["status"], string> = {
  ok: "Sent",
  refused: "Refused by server",
  blocked: "Blocked in browser",
  local: "Local only",
};

export function ActionsPanel({ actions }: { actions: readonly ActionEntry[] }) {
  return (
    <section className="pg-panel" aria-label="Actions">
      <h2 className="pg-panel-title">Actions</h2>
      {actions.length === 0 ? (
        <p className="pg-muted">Click a button in the preview to see what happens. Governed actions go to the server's handlers, which run them as a pretend demo visitor: nothing is really paid, booked or sent.</p>
      ) : (
        <ol className="pg-actions" role="log" aria-live="polite">
          {actions.map((a) => (
            <li key={a.seq} className="pg-action" data-status={a.status}>
              <span className="pg-action-status">{ACTION_LABEL[a.status]}</span>
              <span className="pg-action-node">{a.node}</span>
              <span className="pg-action-detail">{a.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function EventLog({ log }: { log: readonly LogEntry[] }) {
  return (
    <details className="pg-panel pg-log">
      <summary className="pg-panel-title">Event log ({log.length})</summary>
      {log.length === 0 ? (
        <p className="pg-muted">Parser and renderer events appear here during a run.</p>
      ) : (
        <ol className="pg-log-list">
          {log.map((e) => (
            <li key={e.seq} className="pg-log-entry" data-tone={e.tone}>
              <span className="pg-log-ms">{e.ms} ms</span>
              <span className="pg-log-kind">{e.kind}</span>
              <span className="pg-log-text">{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
