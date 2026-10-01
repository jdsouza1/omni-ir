// Writes the Android demo app's pictures (android/demo/src/main/res/drawable/omni_*.xml) from the web
// app's asset registry (app/assets.ts), as Android vector drawables, so all three demos show the same
// pictures under the same names. The converter covers exactly what those SVGs use: rect (optionally
// rounded), circle, path, g with inherited fill and stroke, and one linear gradient in bounding-box units.
//
//   npm run android:drawables               write the files
//   npm run android:drawables -- --check    exit 1 if they are out of date (used by the tests)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ASSETS } from "../app/assets";

export const DRAWABLE_DIR = "android/demo/src/main/res/drawable";
const PREFIX = "data:image/svg+xml,";

type Attrs = Record<string, string>;
interface Gradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { offset: string; color: string }[];
}

const attrs = (tag: string): Attrs => Object.fromEntries([...tag.matchAll(/([a-zA-Z0-9-:]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
const num = (s: string | undefined, fallback = 0) => (s === undefined ? fallback : Number(s));

/** Android resource name for an asset name: "cabin-pines" → "omni_cabin_pines". */
export const drawableName = (asset: string) => `omni_${asset.replace(/-/g, "_")}`;

function rectPath(a: Attrs): { d: string; box: [number, number, number, number] } {
  const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
  const r = Math.min(num(a.rx), w / 2, h / 2);
  const d = r
    ? `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
    : `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  return { d, box: [x, y, w, h] };
}

function circlePath(a: Attrs): string {
  const [cx, cy, r] = [num(a.cx), num(a.cy), num(a.r)];
  return `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;
}

export function svgToVector(svg: string): string {
  const root = attrs(svg.match(/<svg[^>]*>/)![0]);
  const [, , vw, vh] = (root.viewBox ?? "0 0 100 100").split(/\s+/).map(Number);
  const gradients = new Map<string, Gradient>();
  for (const m of svg.matchAll(/<linearGradient([^>]*)>([\s\S]*?)<\/linearGradient>/g)) {
    const g = attrs(m[1]!);
    gradients.set(g.id!, {
      x1: num(g.x1, 0), y1: num(g.y1, 0), x2: num(g.x2, 1), y2: num(g.y2, 0),
      stops: [...m[2]!.matchAll(/<stop([^>]*)\/>/g)].map((s) => {
        const sa = attrs(s[1]!);
        return { offset: sa.offset ?? "0", color: sa["stop-color"] ?? "#000000" };
      }),
    });
  }

  const out: string[] = [];
  const inherited: Attrs[] = [];
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, "").replace(/^<svg[^>]*>|<\/svg>$/g, "");
  for (const m of body.matchAll(/<(\/?)(g|rect|circle|path)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tag, raw, selfClosing] = m;
    if (tag === "g") {
      if (closing) inherited.pop();
      else inherited.push(attrs(raw!));
      continue;
    }
    const a: Attrs = Object.assign({}, ...inherited, attrs(raw!));
    let d: string;
    let box: [number, number, number, number] = [0, 0, vw!, vh!];
    if (tag === "rect") ({ d, box } = rectPath(a));
    else if (tag === "circle") d = circlePath(a);
    else d = a.d!;
    void selfClosing;
    out.push(pathXml(d, a, box, gradients));
  }

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<!-- Generated from app/assets.ts by \`npm run android:drawables\`; do not edit. -->`,
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"`,
    `    xmlns:aapt="http://schemas.android.com/aapt"`,
    `    android:width="${vw}dp"`,
    `    android:height="${vh}dp"`,
    `    android:viewportWidth="${vw}"`,
    `    android:viewportHeight="${vh}">`,
    ...out,
    `</vector>`,
    ``,
  ].join("\n");
}

function pathXml(d: string, a: Attrs, box: [number, number, number, number], gradients: Map<string, Gradient>): string {
  const fill = a.fill ?? "#000000"; // SVG's default fill is black
  const lines = [`  <path android:pathData="${d}"`];
  let gradient: Gradient | undefined;
  if (fill.startsWith("url(#")) gradient = gradients.get(fill.slice(5, -1));
  else if (fill !== "none") lines.push(`      android:fillColor="${fill}"`);
  if (a.stroke && a.stroke !== "none") {
    lines.push(`      android:strokeColor="${a.stroke}"`, `      android:strokeWidth="${num(a["stroke-width"], 1)}"`);
    if (a["stroke-linejoin"]) lines.push(`      android:strokeLineJoin="${a["stroke-linejoin"]}"`);
    if (a["stroke-linecap"]) lines.push(`      android:strokeLineCap="${a["stroke-linecap"]}"`);
  }
  if (!gradient) return lines.join("\n") + " />";
  // Bounding-box units: 0..1 across the shape.
  const [x, y, w, h] = box;
  return [
    ...lines.map((l, i) => (i === lines.length - 1 ? l + ">" : l)),
    `    <aapt:attr name="android:fillColor">`,
    `      <gradient android:type="linear" android:startX="${x + gradient.x1 * w}" android:startY="${y + gradient.y1 * h}" android:endX="${x + gradient.x2 * w}" android:endY="${y + gradient.y2 * h}">`,
    ...gradient.stops.map((s) => `        <item android:offset="${s.offset}" android:color="${s.color}" />`),
    `      </gradient>`,
    `    </aapt:attr>`,
    `  </path>`,
  ].join("\n");
}

/** Every drawable, by file name. */
export function renderDrawables(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ASSETS).map(([name, asset]) => {
      if (!asset.src.startsWith(PREFIX)) throw new Error(`asset ${name} is not an SVG data URI`);
      return [`${drawableName(name)}.xml`, svgToVector(decodeURIComponent(asset.src.slice(PREFIX.length)))];
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = renderDrawables();
  if (process.argv.includes("--check")) {
    const stale = Object.entries(files).filter(([file, text]) => {
      try {
        return readFileSync(join(DRAWABLE_DIR, file), "utf8") !== text;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(`${DRAWABLE_DIR} is out of date: run npm run android:drawables`);
      process.exit(1);
    }
    console.log(`${DRAWABLE_DIR} is up to date.`);
  } else {
    mkdirSync(DRAWABLE_DIR, { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(join(DRAWABLE_DIR, file), text);
    console.log(`wrote ${Object.keys(files).length} drawables to ${DRAWABLE_DIR}`);
  }
}
