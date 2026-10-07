// The host's look on the catalog's design tokens (PLAN-MCPAPPS.md, decision 5). MCP Apps hosts pass
// standard CSS variables and a light or dark theme; each one with a token of the same role replaces
// the catalog's default, unless it would break a contrast pair (CONTRAST_PAIRS, WCAG AA) or can't be
// checked (only "#rgb" and "#rrggbb" colours can). Nothing here comes from the model.
import { CONTRAST_PAIRS, DARK, LIGHT, contrast, cssVariable, type ColorToken } from "@omni-ir/react";

export interface HostContextLike {
  theme?: "light" | "dark";
  styles?: { variables?: Readonly<Record<string, string | undefined>> };
}

export interface HostTheme {
  theme: "light" | "dark";
  /** CSS variables (`--omni-…`) to set on the catalog's root. */
  variables: Record<string, string>;
  /** Tokens the host offered a colour for, kept at the catalog's own value. */
  kept: ColorToken[];
}

/** Which host variable stands for each token. */
const COLORS: readonly (readonly [ColorToken, string])[] = [
  ["surface", "--color-background-primary"],
  ["subtle", "--color-background-secondary"],
  ["text", "--color-text-primary"],
  ["mutedText", "--color-text-secondary"],
  ["labelText", "--color-text-secondary"],
  ["placeholder", "--color-text-tertiary"],
  ["border", "--color-border-primary"],
  ["inputBorder", "--color-border-secondary"],
  ["divider", "--color-border-tertiary"],
  ["dangerText", "--color-text-danger"],
  ["dangerSoft", "--color-background-danger"],
  ["successText", "--color-text-success"],
  ["successSoft", "--color-background-success"],
  ["warningText", "--color-text-warning"],
  ["warningSoft", "--color-background-warning"],
];
const SHAPES = [
  ["font", "--font-sans"],
  ["radius", "--border-radius-md"],
] as const;

export function hostTheme(context: HostContextLike | undefined): HostTheme {
  const theme = context?.theme === "dark" ? "dark" : "light";
  const given = context?.styles?.variables ?? {};
  const base = theme === "dark" ? DARK : LIGHT;

  const mapped = new Map<ColorToken, string>();
  const kept = new Set<ColorToken>();
  for (const [token, name] of COLORS) {
    const raw = given[name];
    if (raw === undefined || raw.trim() === "") continue;
    const colour = hexColour(pickTheme(raw, theme));
    if (colour) mapped.set(token, colour);
    else kept.add(token);
  }

  // Drop host colours until every pair passes: the foreground first, as it's the one being read.
  const colour = (token: ColorToken) => mapped.get(token) ?? base[token];
  for (let changed = true; changed; ) {
    changed = false;
    for (const [fore, back, minimum] of CONTRAST_PAIRS) {
      if (contrast(colour(fore), colour(back)) >= minimum) continue;
      const drop = mapped.has(fore) ? fore : mapped.has(back) ? back : null;
      if (drop === null) continue;
      mapped.delete(drop);
      kept.add(drop);
      changed = true;
    }
  }

  const variables: Record<string, string> = {};
  for (const [token, value] of mapped) variables[cssVariable(token)] = value;
  for (const [shape, name] of SHAPES) {
    const value = given[name]?.trim();
    // Font and radius only: a list of font names, or a length. Nothing that could end the declaration.
    if (value && !/[;{}<>]/.test(value)) variables[cssVariable(shape)] = value;
  }
  return { theme, variables, kept: [...kept] };
}

/** The side of `light-dark(a, b)` for the theme, or the value itself. */
function pickTheme(value: string, theme: "light" | "dark"): string {
  const match = /^light-dark\((.*)\)$/s.exec(value.trim());
  if (!match) return value.trim();
  const [light, dark] = splitTopLevel(match[1]!);
  return ((theme === "dark" ? dark : light) ?? "").trim();
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** "#rrggbb" for "#rgb" or "#rrggbb", lower case; null for anything else (it can't be checked). */
function hexColour(value: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${[...value.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  return null;
}
