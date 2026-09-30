// The Trusted Catalog. These components own all styling (class names in omni.css); nothing from the
// stream can add classes, styles or markup. Text is always rendered as a React text node.
import type { CatalogProps } from "./types";

export function Stack({ id, props, children }: CatalogProps<"Stack">) {
  const direction = props.direction ?? "column";
  return (
    <div
      data-node-id={id}
      className={`omni-stack omni-stack--${direction} omni-gap--${props.gap ?? "md"} omni-align--${props.align ?? "stretch"}`}
    >
      {children}
    </div>
  );
}

export function Card({ id, props, children }: CatalogProps<"Card">) {
  return (
    <section data-node-id={id} className="omni-card">
      {props.title !== undefined && <header className="omni-card__title">{display(props.title)}</header>}
      <div className="omni-card__body">{children}</div>
    </section>
  );
}

export function Heading({ id, props }: CatalogProps<"Heading">) {
  const text = display(props.text);
  switch (props.level ?? 2) {
    case 1:
      return <h1 data-node-id={id} className="omni-heading omni-heading--1">{text}</h1>;
    case 2:
      return <h2 data-node-id={id} className="omni-heading omni-heading--2">{text}</h2>;
    case 3:
      return <h3 data-node-id={id} className="omni-heading omni-heading--3">{text}</h3>;
  }
}

export function Text({ id, props, locale }: CatalogProps<"Text">) {
  return <p data-node-id={id} className={`omni-text omni-text--${props.tone ?? "default"}`}>{formatText(props, locale)}</p>;
}

export function Input({ id, props, value, onChange }: CatalogProps<"Input">) {
  return (
    <label data-node-id={id} className="omni-input">
      <span className="omni-input__label">{props.label}</span>
      <input
        className="omni-input__field"
        type="text"
        value={value}
        placeholder={props.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function Button({ id, props, onPress, disabled, error, mcpTool }: CatalogProps<"Button">) {
  return (
    <span data-node-id={id} className="omni-button-wrap">
      <button
        type="button"
        className={`omni-button omni-button--${props.variant ?? "primary"}`}
        disabled={disabled}
        onClick={onPress}
        data-mcp-tool={mcpTool}
        data-mcp-error={error === undefined ? undefined : "true"}
        aria-invalid={error === undefined ? undefined : true}
      >
        {display(props.label)}
      </button>
      {error !== undefined && (
        <span className="omni-button__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

export function Divider({ id }: CatalogProps<"Divider">) {
  return <hr data-node-id={id} className="omni-divider" />;
}

export function Badge({ id, props }: CatalogProps<"Badge">) {
  return <span data-node-id={id} className={`omni-badge omni-badge--${props.tone ?? "neutral"}`}>{display(props.text)}</span>;
}

export function Skeleton({ id, props }: CatalogProps<"Skeleton">) {
  return <SkeletonLines lines={props.lines ?? 1} nodeId={id} />;
}

export function SkeletonLines({ lines, pendingId, nodeId }: { lines: number; pendingId?: string; nodeId?: string }) {
  return (
    <div className="omni-skeleton" aria-busy="true" aria-label="Loading" data-pending-id={pendingId} data-node-id={nodeId}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="omni-skeleton__line" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function display(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function formatText(props: CatalogProps<"Text">["props"], locale: string): string {
  const { text, format } = props;
  if (format === "currency" && typeof text === "number") {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: props.currency ?? "USD" }).format(text);
    } catch {
      return String(text);
    }
  }
  if (format === "date" && typeof text === "string") {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    // A date-only string ("2026-09-30") is parsed as UTC midnight; format it in UTC so it
    // doesn't shift to the previous day in time zones west of UTC.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...(dateOnly ? { timeZone: "UTC" } : {}) }).format(date);
  }
  return display(text);
}
