// The demo app's own components on the web (Step 20): the views for app/components.ts. They are the
// app's code, the trusted part: the stream only chose the values in their props. They draw with the
// design tokens (--omni-* CSS variables), so they follow the app's theme like the catalog does.
import { useId, type CSSProperties } from "react";
import type { AppViewProps, AppViews, Picture } from "@omni-ir/react";
import { ASSETS } from "./assets";
import { PRODUCT_PICTURES } from "./components";

/** The demo's lookup for picture patterns: a product id to one of its registered pictures. */
export function resolvePicture(name: string): Picture | undefined {
  const asset = Object.hasOwn(PRODUCT_PICTURES, name) ? PRODUCT_PICTURES[name] : undefined;
  return asset !== undefined && Object.hasOwn(ASSETS, asset) ? ASSETS[asset] : undefined;
}

const card: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 96px) minmax(0, 1fr)",
  gap: "0.875rem",
  alignItems: "start",
  padding: "0.875rem",
  border: "1px solid var(--omni-border)",
  borderRadius: "calc(var(--omni-radius) * 1.5)",
  background: "var(--omni-surface)",
  color: "var(--omni-text)",
};

function ProductCard({ id, props, children, picture, locale }: AppViewProps) {
  const name = String(props.name ?? "");
  const price = typeof props.price === "number" ? props.price : Number(props.price);
  const currency = typeof props.currency === "string" ? props.currency : "USD";
  const shown = Number.isFinite(price) ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(price) : "";
  const pic = picture(typeof props.picture === "string" ? props.picture : undefined);
  const rating = typeof props.rating === "number" ? props.rating : undefined;
  const badges = Array.isArray(props.badges) ? props.badges.map(String) : [];
  return (
    <article data-node-id={id} style={card} aria-label={name}>
      {pic ? (
        <img src={pic.src} alt="" width={96} height={96} style={{ width: "100%", height: "auto", aspectRatio: "1", objectFit: "cover", borderRadius: "var(--omni-radius)", background: "var(--omni-subtle)" }} />
      ) : (
        <div aria-hidden="true" style={{ aspectRatio: "1", borderRadius: "var(--omni-radius)", background: "var(--omni-subtle)" }} />
      )}
      <div style={{ display: "grid", gap: "0.375rem", minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, overflowWrap: "anywhere" }}>{name}</h3>
        <p style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{shown}</p>
        {rating !== undefined && (
          <p style={{ margin: 0, color: "var(--omni-muted-text)", fontSize: "0.875rem" }}>
            {`Rated ${rating} out of 5`}
          </p>
        )}
        {badges.length > 0 && (
          <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", margin: 0, padding: 0, listStyle: "none" }}>
            {badges.map((b) => (
              <li key={b} style={{ fontSize: "0.75rem", padding: "0.125rem 0.5rem", borderRadius: 999, background: "var(--omni-subtle)" }}>
                {b}
              </li>
            ))}
          </ul>
        )}
        {children !== null && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.25rem" }}>{children}</div>}
      </div>
    </article>
  );
}

const stepper: CSSProperties = {
  width: "2.5rem",
  height: "2.5rem",
  border: "1px solid var(--omni-input-border)",
  borderRadius: "var(--omni-radius)",
  background: "var(--omni-surface)",
  color: "var(--omni-text)",
  fontSize: "1.25rem",
  lineHeight: 1,
  cursor: "pointer",
};

function QuantityPicker({ id, props, field }: AppViewProps) {
  const labelId = useId();
  const min = typeof props.min === "number" ? props.min : 0;
  const max = typeof props.max === "number" ? props.max : 99;
  const current = typeof field?.value === "number" ? field.value : null;
  const set = (n: number) => field?.onChange(Math.min(max, Math.max(min, n)));
  const invalid = field?.error !== undefined;
  return (
    <div data-node-id={id} style={{ display: "grid", gap: "0.375rem" }}>
      <span id={labelId} style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--omni-label-text)" }}>
        {String(props.label ?? "")}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={invalid ? field?.errorId : undefined}
        aria-invalid={invalid || undefined}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) field?.onBlur?.();
        }}
        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
      >
        <button type="button" aria-label="Fewer" style={stepper} disabled={current !== null && current <= min} onClick={() => set((current ?? min) - 1)}>
          −
        </button>
        <output aria-live="polite" style={{ minWidth: "2ch", textAlign: "center", fontSize: "1.125rem", fontVariantNumeric: "tabular-nums" }}>
          {current ?? "–"}
        </output>
        <button type="button" aria-label="More" style={stepper} disabled={current !== null && current >= max} onClick={() => set(current === null ? min : current + 1)}>
          +
        </button>
      </div>
      {invalid && (
        <span id={field?.errorId} className="omni-field__error" aria-live="polite">
          {field?.error}
        </span>
      )}
    </div>
  );
}

export const APP_VIEWS: AppViews = { ProductCard, QuantityPicker };
