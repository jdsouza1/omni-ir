// The Omni-IR source, line by line, as it streams. Model text is only ever rendered as React text.
import type { ReactNode } from "react";
import type { LineIssue } from "./usePlayground";

const STATEMENT = /^(\s*)(\$?[A-Za-z_]\w*)(\s*=\s*)([A-Z]\w*)?(.*)$/;

/**
 * Colour a line like the landing page's blueprint: id, `=`, component name, arguments.
 * Presentation only; the spans hold the same text, and anything that doesn't look like a
 * statement (comments, broken lines) stays one plain span.
 */
function colorize(text: string): ReactNode {
  if (/^\s*#/.test(text)) return <span className="pg-tok-comment">{text}</span>;
  const m = STATEMENT.exec(text);
  if (!m) return text;
  const [, lead, id, eq, name, rest] = m;
  return (
    <>
      {lead}
      <span className={id!.startsWith("$") ? "pg-tok-state" : "pg-tok-id"}>{id}</span>
      <span className="pg-tok-eq">{eq}</span>
      {name && <span className="pg-tok-name">{name}</span>}
      <span className="pg-tok-rest">{rest}</span>
    </>
  );
}

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
              <span className="pg-line-text">{colorize(text)}</span>
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
