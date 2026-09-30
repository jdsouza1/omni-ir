// The Omni-IR source, line by line, as it streams. Model text is only ever rendered as React text.
import type { LineIssue } from "./usePlayground";

export interface SourceViewProps {
  source: string;
  issues: readonly LineIssue[];
  /** Node id (or $state key) → the line that defined it. */
  nodeLines: Readonly<Record<string, number>>;
  streaming: boolean;
  /** The node currently highlighted in the preview (Task E). */
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
}

export function SourceView({ source, issues, nodeLines, streaming, highlightedId = null, onHighlight }: SourceViewProps) {
  if (source === "") return <p className="pg-muted">Omni-IR lines appear here as they arrive.</p>;

  const lines = source.split("\n").map((line) => line.replace(/\r$/, ""));
  const complete = source.endsWith("\n");
  if (complete) lines.pop(); // the empty string after the final newline
  const definedOn = new Map(Object.entries(nodeLines).map(([id, line]) => [line, id]));
  const issuesOn = new Map<number, LineIssue[]>();
  const documentIssues: LineIssue[] = [];
  for (const issue of issues) {
    if (issue.line === undefined) documentIssues.push(issue);
    else issuesOn.set(issue.line, [...(issuesOn.get(issue.line) ?? []), issue]);
  }

  return (
    <div className="pg-sourceview">
      <ol className="pg-lines" aria-label="Source lines">
        {lines.map((text, i) => {
          const n = i + 1;
          const partial = streaming && !complete && i === lines.length - 1;
          const lineIssues = issuesOn.get(n) ?? [];
          const severity = lineIssues.some((x) => x.severity === "error") ? "error" : lineIssues.length ? "warning" : undefined;
          const defines = definedOn.get(n);
          const nodeId = defines && !defines.startsWith("$") ? defines : undefined;
          return (
            <li
              key={n}
              className="pg-line"
              data-line={n}
              data-defines={defines}
              data-severity={severity}
              data-partial={partial || undefined}
              data-highlighted={nodeId !== undefined && nodeId === highlightedId ? "true" : undefined}
              tabIndex={nodeId ? 0 : undefined}
              aria-label={nodeId ? `Line ${n}, defines ${nodeId}` : undefined}
              onMouseEnter={nodeId && onHighlight ? () => onHighlight(nodeId) : undefined}
              onMouseLeave={nodeId && onHighlight ? () => onHighlight(null) : undefined}
              onFocus={nodeId && onHighlight ? () => onHighlight(nodeId) : undefined}
              onBlur={nodeId && onHighlight ? () => onHighlight(null) : undefined}
            >
              <span className="pg-line-number" aria-hidden="true">
                {n}
              </span>
              <span className="pg-line-text">{text}</span>
              {lineIssues.map((issue, k) => (
                <span key={k} className="pg-line-issue" data-severity={issue.severity}>
                  {issue.severity === "error" ? "Error" : "Warning"} ({issue.code}): {issue.message}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
      {documentIssues.length > 0 && (
        <div className="pg-doc-issues">
          <h3 className="pg-doc-issues-title">Document issues</h3>
          <ul>
            {documentIssues.map((issue, k) => (
              <li key={k} data-severity={issue.severity}>
                {issue.code}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
