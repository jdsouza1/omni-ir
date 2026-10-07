// Charts for the Trusted Catalog (Step 11). The stream supplies only a title, labels and numbers;
// everything drawn here (colours, sizes, axes, legend, the value readout) is the catalog's own.
// The SVG is decorative to assistive technology: the same data is in a table made of the chart's
// Series or Slice components, which screen readers read instead.
import { cssVariable } from "./theme.js";
import { useId, useState, type ReactNode } from "react";
import type { CatalogProps, ChartFormatProps } from "./types.js";

/**
 * Series colours in a fixed order, checked for colour blindness on the catalog's light surface
 * (adjacent pairs). Some fall below 3:1 against white, so charts always show values as text too:
 * the legend, the readout and the data table.
 */
// The chart colours are design tokens (theme.ts): CSS variables, so the light and dark themes and an
// app's own brand apply. SVG attributes can't hold var(), so marks set them through `style`.
export const CHART_COLORS = ([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) => `var(${cssVariable(`chart${n}`)})`);
/** Line charts also tell series apart by dash pattern, so colour is never the only cue. */
const DASHES = ["", "6 4", "2 3", "10 3 2 3", "1 4", "12 4"] as const;

const W = 360;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 30, left: 48 };
/** The pie chart's own square canvas. */
const PIE = 200;

export function formatValue(value: number, props: ChartFormatProps, locale: string): string {
  try {
    if (props.format === "currency") return new Intl.NumberFormat(locale, { style: "currency", currency: props.currency ?? "USD" }).format(value);
    // Percent values are percentages already: 62 is 62%.
    if (props.format === "percent") return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) + "%";
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  } catch {
    return String(value);
  }
}

/** An axis tick, written short: $20K rather than $20,000.00. */
export function formatTick(value: number, props: ChartFormatProps, locale: string): string {
  try {
    const compact = { notation: "compact", maximumFractionDigits: 1 } as const;
    if (props.format === "currency") return new Intl.NumberFormat(locale, { style: "currency", currency: props.currency ?? "USD", ...compact }).format(value);
    if (props.format === "percent") return new Intl.NumberFormat(locale, compact).format(value) + "%";
    return new Intl.NumberFormat(locale, compact).format(value);
  } catch {
    return String(value);
  }
}

/** Round axis ticks from the lowest to the highest value (including 0). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [lo, lo + 1];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t < hi + step - 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  if ((ticks.at(-1) ?? hi) < hi) ticks.push(Number((ticks.at(-1)! + step).toPrecision(12)));
  return ticks;
}

interface Point {
  key: string;
  label: string;
}

function ChartFrame({ id, title, legend, readout, table, children }: { id: string; title: string; legend?: ReactNode; readout: string; table: ReactNode; children: ReactNode }) {
  return (
    <figure data-node-id={id} className="omni-chart">
      <figcaption className="omni-chart__title">{title}</figcaption>
      <div className="omni-chart__plot">{children}</div>
      {legend}
      <p className="omni-chart__readout" aria-live="polite">
        {readout}
      </p>
      <div className="omni-visually-hidden">{table}</div>
    </figure>
  );
}

function Legend({ items }: { items: { key: string; name: string; color: string; dash?: string; note?: string }[] }) {
  return (
    <ul className="omni-chart__legend">
      {items.map((item) => (
        <li key={item.key}>
          <svg width="18" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="17" y2="5" style={{ stroke: item.color }} strokeWidth="3" strokeLinecap="round" strokeDasharray={item.dash || undefined} />
          </svg>
          {item.name}
          {item.note !== undefined && <span className="omni-chart__share">{item.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The chart's data as a table for screen readers; each row is one Series or Slice component. */
function DataTable({ title, headings, children }: { title: string; headings: string[]; children: ReactNode }) {
  return (
    <div role="table" aria-label={title}>
      <div role="row">
        {headings.map((h, i) => (
          <span key={i} role="columnheader">
            {h}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

function XYChart({ kind, id, props, series, children, locale }: CatalogProps<"BarChart"> & { kind: "bar" | "line" }) {
  const [active, setActive] = useState<Point | undefined>(undefined);
  const clip = useId();
  const arrived = series.flatMap((s, i) => (s ? [{ ...s, index: i }] : []));
  const values = arrived.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0));
  const lo = ticks[0]!;
  const hi = ticks.at(-1)!;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / props.labels.length;
  const xCenter = (i: number) => PAD.left + band * i + band / 2;
  const show = (label: string, name: string, value: number) => setActive({ key: `${label}/${name}`, label: `${label} · ${name}: ${formatValue(value, props, locale)}` });

  const marks: ReactNode[] = [];
  if (kind === "bar") {
    const groupW = band * 0.72;
    const barW = Math.max(2, groupW / Math.max(series.length, 1) - 2);
    arrived.forEach((s) => {
      s.values.forEach((v, li) => {
        const x = PAD.left + band * li + (band - groupW) / 2 + s.index * (barW + 2);
        const top = y(Math.max(v, 0));
        const height = Math.max(1, Math.abs(y(v) - y(0)));
        marks.push(
          <rect
            key={`${s.id}-${li}`}
            x={x}
            y={top}
            width={barW}
            height={height}
            rx={Math.min(3, barW / 2)}
            style={{ fill: CHART_COLORS[s.index % CHART_COLORS.length] }}
            tabIndex={0}
            onMouseEnter={() => show(props.labels[li] ?? "", s.name, v)}
            onFocus={() => show(props.labels[li] ?? "", s.name, v)}
            className="omni-chart__mark"
          />,
        );
      });
    });
  } else {
    arrived.forEach((s) => {
      const color = CHART_COLORS[s.index % CHART_COLORS.length];
      const points = s.values.map((v, li) => `${xCenter(li)},${y(v)}`).join(" ");
      marks.push(<polyline key={`${s.id}-line`} points={points} fill="none" style={{ stroke: color }} strokeWidth="2" strokeDasharray={DASHES[s.index % DASHES.length] || undefined} strokeLinejoin="round" />);
      s.values.forEach((v, li) =>
        marks.push(
          <circle
            key={`${s.id}-${li}`}
            cx={xCenter(li)}
            cy={y(v)}
            r="4"
            style={{ fill: color, stroke: "var(--omni-surface)" }}
            strokeWidth="2"
            tabIndex={0}
            onMouseEnter={() => show(props.labels[li] ?? "", s.name, v)}
            onFocus={() => show(props.labels[li] ?? "", s.name, v)}
            className="omni-chart__mark"
          />,
        ),
      );
    });
  }

  const legend =
    series.length >= 2 ? (
      <Legend
        items={series.map((s, i) => ({
          key: s?.id ?? String(i),
          name: s?.name ?? "…",
          color: CHART_COLORS[i % CHART_COLORS.length]!,
          ...(kind === "line" ? { dash: DASHES[i % DASHES.length] } : {}),
        }))}
      />
    ) : undefined;

  return (
    <ChartFrame
      id={id}
      title={props.title}
      legend={legend}
      readout={active?.label ?? ""}
      table={
        <DataTable title={props.title} headings={["", ...props.labels]}>
          {children}
        </DataTable>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="omni-chart__svg" aria-hidden="true" onMouseLeave={() => setActive(undefined)}>
        <clipPath id={clip}>
          <rect x={PAD.left} y={PAD.top - 4} width={plotW} height={plotH + 8} />
        </clipPath>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "omni-chart__baseline" : "omni-chart__grid"} />
            <text x={PAD.left - 6} y={y(t)} className="omni-chart__tick" textAnchor="end" dominantBaseline="middle">
              {formatTick(t, props, locale)}
            </text>
          </g>
        ))}
        {props.labels.map((label, i) => (
          <text key={i} x={xCenter(i)} y={H - 8} className="omni-chart__tick" textAnchor="middle">
            {label}
          </text>
        ))}
        <g clipPath={`url(#${clip})`}>{marks}</g>
      </svg>
    </ChartFrame>
  );
}

export function BarChart(p: CatalogProps<"BarChart">) {
  return <XYChart {...p} kind="bar" />;
}

export function LineChart(p: CatalogProps<"LineChart">) {
  return <XYChart {...(p as CatalogProps<"BarChart">)} kind="line" />;
}

export function PieChart({ id, props, slices, children, locale, strings }: CatalogProps<"PieChart">) {
  const [active, setActive] = useState<string>("");
  const arrived = slices.flatMap((s, i) => (s ? [{ ...s, index: i }] : []));
  const total = arrived.reduce((sum, s) => sum + s.value, 0);
  const cx = PIE / 2;
  const cy = PIE / 2;
  const r = PIE / 2 - 4;
  const share = (v: number) => (total > 0 ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format((v / total) * 100)}%` : "0%");
  let angle = -Math.PI / 2;
  const arcs = arrived.map((s) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const start = angle;
    angle += sweep;
    const color = CHART_COLORS[s.index % CHART_COLORS.length];
    const describe = () => setActive(`${s.name}: ${formatValue(s.value, props, locale)} (${share(s.value)})`);
    const common = { style: { fill: color, stroke: "var(--omni-surface)" }, strokeWidth: 2, tabIndex: 0, onMouseEnter: describe, onFocus: describe, className: "omni-chart__mark" };
    if (sweep >= Math.PI * 2 - 1e-9) return <circle key={s.id} cx={cx} cy={cy} r={r} {...common} />;
    if (sweep === 0) return null;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return <path key={s.id} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} {...common} />;
  });

  return (
    <ChartFrame
      id={id}
      title={props.title}
      legend={
        <Legend
          items={slices.map((s, i) => ({
            key: s?.id ?? String(i),
            name: s?.name ?? "…",
            color: CHART_COLORS[i % CHART_COLORS.length]!,
            ...(s ? { note: share(s.value) } : {}),
          }))}
        />
      }
      readout={active}
      table={
        <DataTable title={props.title} headings={["", strings.value]}>
          {children}
        </DataTable>
      }
    >
      <svg viewBox={`0 0 ${PIE} ${PIE}`} className="omni-chart__svg omni-chart__svg--pie" aria-hidden="true" onMouseLeave={() => setActive("")}>
        {arcs}
      </svg>
    </ChartFrame>
  );
}

/** One Series as a row of the chart's data table (read by screen readers; the SVG draws it). */
export function Series({ id, props, locale }: CatalogProps<"Series">) {
  return (
    <div data-node-id={id} role="row">
      <span role="rowheader">{props.name}</span>
      {props.values.map((v, i) => (
        <span key={i} role="cell">
          {new Intl.NumberFormat(locale).format(v)}
        </span>
      ))}
    </div>
  );
}

/** One Slice as a row of the pie chart's data table. */
export function Slice({ id, props, locale }: CatalogProps<"Slice">) {
  return (
    <div data-node-id={id} role="row">
      <span role="rowheader">{props.name}</span>
      <span role="cell">{new Intl.NumberFormat(locale).format(props.value)}</span>
    </div>
  );
}
