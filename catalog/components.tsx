// The Trusted Catalog. These components own all styling (class names in omni.css); nothing from the
// stream can add classes, styles or markup. Text is always rendered as a React text node.
import type { CatalogProps } from "./types";

export function Stack({ props, children }: CatalogProps<"Stack">) {
  const direction = props.direction ?? "column";
  return (
    <div
      className={`omni-stack omni-stack--${direction} omni-gap--${props.gap ?? "md"} omni-align--${props.align ?? "stretch"}`}
    >
      {children}
    </div>
  );
}

export function Card({ props, children }: CatalogProps<"Card">) {
  return (
    <section className="omni-card">
      {props.title !== undefined && <header className="omni-card__title">{display(props.title)}</header>}
      <div className="omni-card__body">{children}</div>
    </section>
  );
}

export function Heading({ props }: CatalogProps<"Heading">) {
  const text = display(props.text);
  switch (props.level ?? 2) {
    case 1:
      return <h1 className="omni-heading omni-heading--1">{text}</h1>;
    case 2:
      return <h2 className="omni-heading omni-heading--2">{text}</h2>;
    case 3:
      return <h3 className="omni-heading omni-heading--3">{text}</h3>;
  }
}

export function Text({ props, locale }: CatalogProps<"Text">) {
  return <p className={`omni-text omni-text--${props.tone ?? "default"}`}>{formatText(props, locale)}</p>;
}

export function Input({ props, value, onChange }: CatalogProps<"Input">) {
  return (
    <label className="omni-input">
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
    <span className="omni-button-wrap">
      <button
        type="button"
        className={`omni-button omni-button--${props.variant ?? "primary"}`}
        disabled={disabled}
        onClick={onPress}
        data-node-id={id}
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

export function Divider(_: CatalogProps<"Divider">) {
  return <hr className="omni-divider" />;
}

export function Badge({ props }: CatalogProps<"Badge">) {
  return <span className={`omni-badge omni-badge--${props.tone ?? "neutral"}`}>{display(props.text)}</span>;
}

export function Skeleton({ props }: CatalogProps<"Skeleton">) {
  return <SkeletonLines lines={props.lines ?? 1} />;
}

export function SkeletonLines({ lines, pendingId }: { lines: number; pendingId?: string }) {
  return (
    <div className="omni-skeleton" aria-busy="true" aria-label="Loading" data-pending-id={pendingId}>
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
    return Number.isNaN(date.getTime()) ? text : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  }
  return display(text);
}
