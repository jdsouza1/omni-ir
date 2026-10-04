// HTML with Tailwind classes: the markup a model would write for the same screen if it styled
// it itself, one template per Omni-IR component (close to what the Trusted Catalog draws).
// Browsers draw HTML as it arrives, so each component counts as arrived once its own text has.
import type { Emitted, Format } from "./emit";
import { isState, mutationFor, nodes, refsIn, ROOT, type NodeStmt, type Screen, type Value } from "./tree";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s: string) => esc(s).replace(/"/g, "&quot;");

const GAP = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-6" } as Record<string, string>;
const ALIGN = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" } as Record<string, string>;
const TEXT_TONE = { default: "text-gray-900", muted: "text-sm text-gray-500", strong: "font-semibold text-gray-900" } as Record<string, string>;
const BUTTON = {
  primary: "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700",
  secondary: "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50",
  danger: "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700",
} as Record<string, string>;
const BADGE = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
} as Record<string, string>;
const RATIO = { "1:1": "aspect-square", "4:3": "aspect-[4/3]", "3:2": "aspect-[3/2]", "16:9": "aspect-video" } as Record<string, string>;
const FIELD = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export const HTML: Format = {
  id: "html",
  label: "HTML + Tailwind",
  ext: "html",
  sets: ["omni"],
  emit(screen: Screen): Emitted {
    const byId = new Map(nodes(screen).map((n) => [n.id, n]));
    const state = new Map(screen.stmts.flatMap((s) => (s.kind === "state" ? [[s.key, s.value] as [string, Value]] : [])));
    let text = "";
    const arrivals = new Map<string, number>();
    const line = (depth: number, s: string) => (text += "  ".repeat(depth) + s + "\n");
    const arrived = (id: string) => arrivals.set(id, text.length);
    const prop = (n: NodeStmt, k: string): Value | undefined => n.props.find(([p]) => p === k)?.[1];
    const str = (n: NodeStmt, k: string, fallback = ""): string => {
      const v = prop(n, k);
      if (v === undefined || v === null) return fallback;
      if (isState(v)) return String(state.get(v.key) ?? "");
      return String(v);
    };

    const render = (id: string, depth: number) => {
      const n = byId.get(id);
      if (!n) return;
      const kids = () => refsIn(prop(n, "children") ?? []);
      switch (n.type) {
        case "Stack": {
          const dir = str(n, "direction", "column") === "row" ? "flex-row flex-wrap" : "flex-col";
          line(depth, `<div class="flex ${dir} ${GAP[str(n, "gap", "md")]} ${ALIGN[str(n, "align", "stretch")]}">`);
          arrived(id);
          for (const c of kids()) render(c, depth + 1);
          line(depth, "</div>");
          return;
        }
        case "Card": {
          line(depth, `<section class="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">`);
          if (prop(n, "title") !== undefined) line(depth + 1, `<h2 class="text-base font-semibold text-gray-900">${esc(str(n, "title"))}</h2>`);
          arrived(id);
          for (const c of kids()) render(c, depth + 1);
          line(depth, "</section>");
          return;
        }
        case "Heading": {
          const level = str(n, "level", "2");
          const size = level === "1" ? "text-2xl" : level === "2" ? "text-xl" : "text-lg";
          line(depth, `<h${level} class="${size} font-semibold text-gray-900">${esc(str(n, "text"))}</h${level}>`);
          break;
        }
        case "Text": {
          line(depth, `<p class="${TEXT_TONE[str(n, "tone", "default")]}">${esc(formatText(n, str(n, "text")))}</p>`);
          break;
        }
        case "Input": {
          const v = prop(n, "value") ?? null;
          const name = isState(v) ? v.key.slice(1) : n.id;
          const lines = Number(str(n, "lines", "1"));
          const placeholder = prop(n, "placeholder") !== undefined ? ` placeholder="${attr(str(n, "placeholder"))}"` : "";
          line(depth, `<label class="flex flex-col gap-1">`);
          line(depth + 1, `<span class="text-sm font-medium text-gray-700">${esc(str(n, "label"))}</span>`);
          if (lines > 1) line(depth + 1, `<textarea name="${name}" rows="${lines}"${placeholder} class="${FIELD} resize-none"></textarea>`);
          else line(depth + 1, `<input type="text" name="${name}"${placeholder} class="${FIELD}">`);
          arrived(id);
          line(depth, "</label>");
          return;
        }
        case "DateInput": {
          const v = prop(n, "value") ?? null;
          const name = isState(v) ? v.key.slice(1) : n.id;
          const min = prop(n, "min") !== undefined ? ` min="${str(n, "min")}"` : "";
          const max = prop(n, "max") !== undefined ? ` max="${str(n, "max")}"` : "";
          line(depth, `<label class="flex flex-col gap-1">`);
          line(depth + 1, `<span class="text-sm font-medium text-gray-700">${esc(str(n, "label"))}</span>`);
          line(depth + 1, `<input type="date" name="${name}"${min}${max} class="${FIELD}">`);
          arrived(id);
          line(depth, "</label>");
          return;
        }
        case "Button": {
          // The page's own script would read data-tool and data-params; HTML has no governance of its own.
          const m = mutationFor(screen, id);
          const data = m
            ? ` data-tool="${attr(m.tool)}" data-params="${attr(JSON.stringify(Object.fromEntries(m.params.map(([k, v]) => [k, isState(v) ? `#${v.key.slice(1)}` : v]))))}"`
            : "";
          line(depth, `<button type="button" class="${BUTTON[str(n, "variant", "primary")]}"${data}>${esc(str(n, "label"))}</button>`);
          break;
        }
        case "Divider":
          line(depth, `<hr class="border-gray-200">`);
          break;
        case "Badge":
          line(depth, `<span class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[str(n, "tone", "neutral")]}">${esc(str(n, "text"))}</span>`);
          break;
        case "Skeleton": {
          line(depth, `<div class="flex animate-pulse flex-col gap-2" aria-busy="true">`);
          for (let i = 0; i < Number(str(n, "lines", "1")); i++) line(depth + 1, `<div class="h-3 rounded bg-gray-200"></div>`);
          line(depth, "</div>");
          break;
        }
        case "Image": {
          const ratio = prop(n, "ratio") !== undefined ? ` ${RATIO[str(n, "ratio")]}` : "";
          line(depth, `<img src="/images/${str(n, "asset")}.jpg" alt="${attr(str(n, "alt"))}" class="w-full rounded-lg object-cover${ratio}">`);
          break;
        }
        case "Rating": {
          const max = Number(str(n, "max", "5"));
          const value = Number(str(n, "value", "0"));
          const filled = Math.round(value);
          line(depth, `<div class="flex items-center gap-1" role="img" aria-label="Rated ${value} out of ${max}">`);
          line(depth + 1, `<span class="text-amber-500">${"★".repeat(filled)}<span class="text-gray-300">${"★".repeat(max - filled)}</span></span>`);
          line(depth + 1, `<span class="text-sm text-gray-600">${value}</span>`);
          arrived(id);
          line(depth, "</div>");
          return;
        }
        case "List": {
          line(depth, `<ul class="divide-y divide-gray-200">`);
          arrived(id);
          for (const c of kids()) render(c, depth + 1);
          line(depth, "</ul>");
          return;
        }
        case "ListItem": {
          line(depth, `<li class="flex items-center gap-3 py-3">`);
          if (prop(n, "image") !== undefined) line(depth + 1, `<img src="/images/${str(n, "image")}.jpg" alt="" class="h-12 w-12 rounded-md object-cover">`);
          line(depth + 1, `<div class="min-w-0 flex-1">`);
          line(depth + 2, `<p class="font-medium text-gray-900">${esc(str(n, "title"))}</p>`);
          if (prop(n, "detail") !== undefined) line(depth + 2, `<p class="text-sm text-gray-500">${esc(str(n, "detail"))}</p>`);
          line(depth + 1, "</div>");
          if (prop(n, "trailing") !== undefined) line(depth + 1, `<span class="text-sm font-medium text-gray-900">${esc(str(n, "trailing"))}</span>`);
          arrived(id);
          line(depth, "</li>");
          return;
        }
        case "Message": {
          const user = str(n, "from") === "user";
          const cls = user ? "ml-auto max-w-[80%] rounded-2xl bg-blue-600 px-3 py-2 text-white" : "mr-auto max-w-[80%] rounded-2xl bg-gray-100 px-3 py-2 text-gray-900";
          line(depth, `<div class="${cls}">${esc(str(n, "text"))}</div>`);
          break;
        }
        default:
          throw new Error(`no HTML template for ${n.type}`);
      }
      arrived(id);
    };

    const formatText = (n: NodeStmt, raw: string) => {
      const format = str(n, "format", "plain");
      if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: str(n, "currency", "USD") }).format(Number(raw));
      if (format === "date") return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(raw));
      return raw;
    };

    render(ROOT, 0);
    return { text, arrivals };
  },
};
