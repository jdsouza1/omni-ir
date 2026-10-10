// Screens as text (PLAN-FORMS.md C.1): a plain-text outline of a screen, for hosts that can't draw it
// (the MCP bridge adds it to show_screen's result), for logs and for tests. One component per line,
// nested by indentation. What the person typed into a field stays out unless the app asks for it, so
// personal data doesn't reach a model or a log by default.
import type { OmniDocument } from "./store.js";
import type { OmniNode, Primitive } from "./schema.js";
import { fieldKey, isField } from "./fields.js";

export interface DescribeScreenOptions {
  /** Include what the person typed or chose in fields, and wherever the screen shows it. Default false. */
  values?: boolean;
}

type Props = Readonly<Record<string, unknown>>;

/** Stream text on one line: white space (newlines included) collapsed, so no text can start a line of its own. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

const isStateRef = (value: unknown): value is { kind: "state"; key: string } =>
  typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "state";

function plain(value: Primitive | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? oneLine(value) : String(value);
}

/**
 * Outline `document` from its root. Fields show their label and constraints; with `values`, also
 * their current value. Parts that haven't arrived show as `[loading]`, parts that never will as
 * `[missing]`, and a typed value the screen echoes elsewhere as `[hidden]`.
 */
export function describeScreen(document: OmniDocument, options: DescribeScreenOptions = {}): string {
  const showValues = options.values === true;
  // The $keys a field edits: what the person typed, hidden unless asked.
  const typed = new Set<string>();
  for (const node of document.nodes.values()) if (isField(node)) typed.add(fieldKey(node));

  const lines: string[] = [];
  const seen = new Set<string>();

  const text = (value: unknown): string => {
    if (isStateRef(value)) return !showValues && typed.has(value.key) ? "[hidden]" : plain(document.state[value.key]);
    if (typeof value === "string") return oneLine(value);
    if (typeof value === "number") return String(value);
    return "";
  };
  const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text) : []);
  const fieldValue = (node: OmniNode): string => {
    if (!showValues || !isField(node)) return "";
    const value = document.state[fieldKey(node)];
    if (node.type === "Switch") return value === true ? " = on" : " = off";
    return value === undefined || value === null ? "" : ` = ${JSON.stringify(typeof value === "string" ? oneLine(value) : value)}`;
  };
  const details = (parts: (string | false | undefined)[]) => {
    const kept = parts.filter((p): p is string => typeof p === "string" && p !== "");
    return kept.length ? ` (${kept.join(", ")})` : "";
  };

  /** One line for a component, or null for one that only groups its children (Stack). */
  function line(node: OmniNode): string | null {
    const p = node.props as Props;
    const required = p.required === true && "required";
    switch (node.type) {
      case "App": {
        // By name: its first text as the headline, its other props after it, the edited value last.
        const entries = Object.entries(p).filter(([key, value]) => key !== "required" && !(key === "value" && isStateRef(value)));
        const head = entries.findIndex(([, value]) => typeof value === "string" || isStateRef(value));
        const headline = head === -1 ? "" : `: ${text(entries[head]![1])}`;
        const rest = entries.filter((_, i) => i !== head).map(([key, value]) => `${key}: ${Array.isArray(value) ? texts(value).join(", ") : typeof value === "boolean" ? String(value) : text(value)}`);
        return `${node.name}${headline}${details([required, ...rest])}${fieldValue(node)}`;
      }
      case "Stack":
        return null;
      case "Card":
        return p.title === undefined ? "Card" : `Card: ${text(p.title)}`;
      case "Heading":
        return `Heading: ${text(p.text)}`;
      case "Text":
        return `Text: ${text(p.text)}${details([typeof p.format === "string" && p.format, typeof p.currency === "string" && p.currency])}`;
      case "Input":
        return `Input: ${text(p.label)}${details([required, typeof p.format === "string" && p.format, typeof p.minLength === "number" && `at least ${p.minLength} characters`, typeof p.maxLength === "number" && `at most ${p.maxLength} characters`])}${fieldValue(node)}`;
      case "DateInput":
        return `DateInput: ${text(p.label)}${details([required, typeof p.min === "string" && `from ${p.min}`, typeof p.max === "string" && `until ${p.max}`])}${fieldValue(node)}`;
      case "Select": {
        const choices = texts(p.options);
        const parts = [required, choices.length > 0 && `options: ${choices.join(", ")}`].filter((x): x is string => typeof x === "string");
        return `Select: ${text(p.label)}${parts.length ? ` (${parts.join("; ")})` : ""}${fieldValue(node)}`;
      }
      case "Switch":
        return `Switch: ${text(p.label)}${details([required])}${fieldValue(node)}`;
      case "Button": {
        const mutation = document.mutations.get(node.id);
        return `Button: ${text(p.label)}${mutation ? ` (action: ${mutation.tool})` : ""}`;
      }
      case "Divider":
        return "Divider";
      case "Badge":
        return `Badge: ${text(p.text)}`;
      case "Skeleton":
        return "Skeleton";
      case "Image":
        return `Image: ${text(p.alt)}`;
      case "Rating":
        return `Rating: ${text(p.value)} out of ${typeof p.max === "number" ? p.max : 5}`;
      case "List":
        return "List";
      case "ListItem":
        return `Item: ${[p.title, p.detail, p.trailing].filter((v) => v !== undefined).map(text).join(" · ")}`;
      case "Message":
        return `Message from ${text(p.from)}: ${text(p.text)}`;
      case "Table":
        return `Table: ${texts(p.columns).join(" | ")}`;
      case "TableRow":
        return `Row: ${texts(p.cells).join(" | ")}`;
      case "Tabs":
        return "Tabs";
      case "Tab":
        return `Tab: ${text(p.label)}`;
      case "Notice":
        return `Notice${typeof p.tone === "string" ? ` (${p.tone})` : ""}: ${p.title === undefined ? "" : `${text(p.title)}: `}${text(p.text)}`;
      case "BarChart":
      case "LineChart":
        return `${node.type}: ${text(p.title)}${details([`labels: ${texts(p.labels).join(", ")}`])}`;
      case "PieChart":
        return `PieChart: ${text(p.title)}`;
      case "Series":
        return `Series: ${text(p.name)}: ${texts(p.values).join(", ")}`;
      case "Slice":
        return `Slice: ${text(p.name)}: ${text(p.value)}`;
    }
  }

  function visit(id: string, depth: number) {
    const indent = "  ".repeat(depth);
    const node = document.nodes.get(id);
    if (node === undefined) {
      lines.push(`${indent}${document.complete || document.missing.has(id) ? "[missing]" : "[loading]"}`);
      return;
    }
    // A component is drawn once, even if listed twice.
    if (seen.has(id)) return;
    seen.add(id);
    const own = line(node);
    if (own !== null) lines.push(indent + own);
    for (const child of node.children) visit(child, own === null ? depth : depth + 1);
  }

  visit("root", 0);
  return lines.join("\n");
}
