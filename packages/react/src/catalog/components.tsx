// The Trusted Catalog. These components own all styling (class names in omni.css); nothing from the
// stream can add classes, styles or markup. Text is always rendered as a React text node.
import { fillTemplate } from "./strings.js";
import { Children, useId, useState, type KeyboardEvent } from "react";
import type { CatalogProps } from "./types.js";

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
      {(props.lines ?? 1) > 1 ? (
        // A fixed-height box: longer text scrolls inside it, so the screen doesn't jump while typing.
        <textarea
          className="omni-input__field omni-input__field--multiline"
          rows={props.lines}
          value={value}
          placeholder={props.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="omni-input__field"
          type="text"
          value={value}
          placeholder={props.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
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

export function Skeleton({ id, props, strings }: CatalogProps<"Skeleton">) {
  return <SkeletonLines lines={props.lines ?? 1} nodeId={id} label={strings.loading} />;
}

export function Image({ id, props, picture }: CatalogProps<"Image">) {
  const ratio = props.ratio ? ` omni-ratio--${props.ratio.replace(":", "-")}` : "";
  if (!picture) {
    // The stream named an image this renderer doesn't have: show its description instead.
    return (
      <div data-node-id={id} className={`omni-image omni-image--missing${ratio}`} role="img" aria-label={props.alt}>
        {props.alt}
      </div>
    );
  }
  return (
    <img
      data-node-id={id}
      className={`omni-image${ratio}`}
      src={picture.src}
      alt={props.alt}
      width={picture.width}
      height={picture.height}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

export function Rating({ id, props, locale, strings }: CatalogProps<"Rating">) {
  const max = props.max ?? 5;
  const raw = typeof props.value === "number" ? props.value : Number(props.value);
  const value = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), max) : 0;
  const filled = Math.round(value);
  const shown = value.toLocaleString(locale, { maximumFractionDigits: 2 });
  return (
    <span data-node-id={id} className="omni-rating" role="img" aria-label={fillTemplate(strings.rating, { value: shown, max })}>
      <span className="omni-rating__stars" aria-hidden="true">
        {"★".repeat(filled)}
        <span className="omni-rating__empty">{"★".repeat(max - filled)}</span>
      </span>
      <span className="omni-rating__value" aria-hidden="true">
        {shown}
      </span>
    </span>
  );
}

export function DateInput({ id, props, value, onChange }: CatalogProps<"DateInput">) {
  return (
    <label data-node-id={id} className="omni-input">
      <span className="omni-input__label">{props.label}</span>
      <input
        className="omni-input__field"
        type="date"
        value={value}
        min={props.min}
        max={props.max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// div + role rather than ul/li: placeholders and fallbacks can appear among the items while streaming.
export function List({ id, children }: CatalogProps<"List">) {
  return (
    <div data-node-id={id} className="omni-list" role="list">
      {children}
    </div>
  );
}

export function ListItem({ id, props, picture }: CatalogProps<"ListItem">) {
  return (
    <div data-node-id={id} className="omni-list-item" role="listitem">
      {props.image !== undefined &&
        (picture ? (
          <img className="omni-list-item__image" src={picture.src} alt="" width={picture.width} height={picture.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <span className="omni-list-item__image omni-image--missing" aria-hidden="true" />
        ))}
      <span className="omni-list-item__text">
        <span className="omni-list-item__title">{display(props.title)}</span>
        {props.detail !== undefined && <span className="omni-list-item__detail">{display(props.detail)}</span>}
      </span>
      {props.trailing !== undefined && <span className="omni-list-item__trailing">{display(props.trailing)}</span>}
    </div>
  );
}

export function Message({ id, props, strings }: CatalogProps<"Message">) {
  return (
    <div data-node-id={id} className={`omni-message omni-message--${props.from}`}>
      <span className="omni-visually-hidden">{`${props.from === "user" ? strings.user : strings.assistant}: `}</span>
      {display(props.text)}
    </div>
  );
}

export function Select({ id, props, value, onChange }: CatalogProps<"Select">) {
  // A value that isn't one of the options shows as nothing chosen.
  const chosen = props.options.includes(value) ? value : "";
  return (
    <label data-node-id={id} className="omni-input">
      <span className="omni-input__label">{props.label}</span>
      <select className="omni-input__field omni-select" value={chosen} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {props.placeholder ?? ""}
        </option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Switch({ id, props, value, onChange }: CatalogProps<"Switch">) {
  const labelId = useId();
  return (
    <div data-node-id={id} className="omni-switch">
      <span id={labelId} className="omni-switch__label">
        {props.label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        className={`omni-switch__track${value ? " omni-switch__track--on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="omni-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

// An ARIA table made of divs, like List: placeholders and fallbacks can appear among the rows.
export function Table({ id, props, children }: CatalogProps<"Table">) {
  return (
    <div data-node-id={id} className="omni-table-wrap">
      <div
        className="omni-table"
        role="table"
        style={{ gridTemplateColumns: `repeat(${props.columns.length}, minmax(max-content, 1fr))` }}
      >
        <div className="omni-table__row omni-table__row--head" role="row">
          {props.columns.map((column, i) => (
            <span key={i} className="omni-table__heading" role="columnheader">
              {column}
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export function TableRow({ id, props, locale }: CatalogProps<"TableRow">) {
  return (
    <div data-node-id={id} className="omni-table__row" role="row">
      {props.cells.map((cell, i) => (
        <span key={i} className={`omni-table__cell${typeof cell === "number" ? " omni-table__cell--number" : ""}`} role="cell">
          {typeof cell === "number" ? cell.toLocaleString(locale) : cell}
        </span>
      ))}
    </div>
  );
}

export function Tabs({ id, tabs, children }: CatalogProps<"Tabs">) {
  const base = useId();
  const [picked, setPicked] = useState<string | undefined>(undefined);
  // The first Tab is open until the viewer picks another; a pick survives the stream growing.
  const open = picked !== undefined && tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id;
  const panels = Children.toArray(children);
  const tabId = (i: number) => `${base}-tab-${i}`;
  const panelId = (i: number) => `${base}-panel-${i}`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((t) => t.id === open);
    const next =
      e.key === "ArrowRight" ? (current + 1) % tabs.length
      : e.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0 || tabs.length === 0) return;
    e.preventDefault();
    setPicked(tabs[next]!.id);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div data-node-id={id} className="omni-tabs">
      <div className="omni-tabs__list" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            id={tabId(i)}
            type="button"
            role="tab"
            aria-selected={t.id === open}
            aria-controls={panelId(i)}
            tabIndex={t.id === open ? 0 : -1}
            className={`omni-tabs__tab${t.id === open ? " omni-tabs__tab--open" : ""}`}
            onClick={() => setPicked(t.id)}
          >
            {t.label ?? "…"}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={tabs[i]?.id ?? i} id={panelId(i)} role="tabpanel" aria-labelledby={tabId(i)} hidden={tabs[i]?.id !== open} className="omni-tabs__panel">
          {panel}
        </div>
      ))}
    </div>
  );
}

export function Tab({ id, children }: CatalogProps<"Tab">) {
  // The label is shown by the Tabs above; a Tab draws its content.
  return (
    <div data-node-id={id} className="omni-tab">
      {children}
    </div>
  );
}

export function Notice({ id, props }: CatalogProps<"Notice">) {
  return (
    <div data-node-id={id} className={`omni-notice omni-notice--${props.tone ?? "info"}`} role="note">
      {props.title !== undefined && <strong className="omni-notice__title">{display(props.title)}</strong>}
      <span className="omni-notice__text">{display(props.text)}</span>
    </div>
  );
}

export function SkeletonLines({ lines, pendingId, nodeId, label }: { lines: number; pendingId?: string; nodeId?: string; label: string }) {
  return (
    <div className="omni-skeleton" aria-busy="true" aria-label={label} data-pending-id={pendingId} data-node-id={nodeId}>
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
