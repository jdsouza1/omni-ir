// Design tokens (PLAN-THEMES.md): the colours, font and corner radius the catalog draws with, set by
// the app and never by the stream. On the web they are CSS variables (`--omni-accent`, …) defined in
// omni.css from these values (`npm run theme` writes that block); conformance/theme.json carries the
// same list to the Swift and Kotlin catalogs. Light values are the catalog's original look.

/** Every colour token, in the order they are listed in omni.css and theme.json. */
export const COLOR_TOKENS = [
  "surface",
  "text",
  "mutedText",
  "labelText",
  "border",
  "inputBorder",
  "divider",
  "subtle",
  "placeholder",
  "placeholderHighlight",
  "accent",
  "onAccent",
  "accentSoft",
  "success",
  "successSoft",
  "successText",
  "warning",
  "warningSoft",
  "warningText",
  "danger",
  "dangerSoft",
  "dangerText",
  "chartAxis",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "chart6",
  "chart7",
  "chart8",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Readonly<Record<ColorToken, string>>;

export const LIGHT: Palette = {
  surface: "#ffffff",
  text: "#1f2329",
  mutedText: "#5b616e",
  labelText: "#3c4048",
  border: "#d9dce1",
  // Darker than the original #c3c7ce, which was 1.7:1 on white: a control's edge needs 3:1 (WCAG 1.4.11).
  inputBorder: "#868c97",
  divider: "#e3e5e8",
  subtle: "#eef0f3",
  placeholder: "#eceef1",
  placeholderHighlight: "#f6f7f9",
  accent: "#1f5eff",
  onAccent: "#ffffff",
  accentSoft: "#eef3ff",
  success: "#2e7d32",
  successSoft: "#e3f4e6",
  successText: "#1b5e20",
  warning: "#b7791f",
  warningSoft: "#fff4d6",
  warningText: "#7a5200",
  danger: "#c62828",
  dangerSoft: "#fde4e4",
  dangerText: "#8e1c1c",
  chartAxis: "#9aa0aa",
  chart1: "#2a78d6",
  chart2: "#eb6834",
  chart3: "#1baf7a",
  chart4: "#eda100",
  chart5: "#e87ba4",
  chart6: "#008300",
  chart7: "#4a3aa7",
  chart8: "#e34948",
};

export const DARK: Palette = {
  surface: "#1b2029",
  text: "#e6e8ec",
  mutedText: "#a3aab6",
  labelText: "#c7ccd4",
  border: "#343b47",
  inputBorder: "#737b89",
  divider: "#2c333e",
  subtle: "#262c36",
  placeholder: "#2a303a",
  placeholderHighlight: "#353c47",
  accent: "#7c9dff",
  onAccent: "#0d1428",
  accentSoft: "#1d2846",
  success: "#6fcf86",
  successSoft: "#18301f",
  successText: "#9fe0ae",
  warning: "#e5a93f",
  warningSoft: "#34290f",
  warningText: "#f2c770",
  danger: "#ff7b72",
  dangerSoft: "#3b1a1a",
  dangerText: "#ffa59e",
  chartAxis: "#6b7381",
  chart1: "#5b9cf0",
  chart2: "#f38a5e",
  chart3: "#3cc995",
  chart4: "#f0b429",
  chart5: "#f09bbd",
  chart6: "#3fae3f",
  chart7: "#9b8cf0",
  chart8: "#f07676",
};

/** The font and the corner radius of controls (cards use 1.5×, pictures and notices 1.25×). */
export const SHAPE = { font: "inherit", radius: "8px" } as const;

/** The CSS variable for a token: `surface` → `--omni-surface`, `mutedText` → `--omni-muted-text`. */
export const cssVariable = (token: ColorToken | keyof typeof SHAPE) => `--omni-${token.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`)}`;

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio of two "#rrggbb" colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The pairs a reader depends on, with the contrast each needs (WCAG AA): 4.5 for text, 3 for the
 * edges of controls and focus. Used by the tests for the default themes, and to warn about an app's own.
 */
export const CONTRAST_PAIRS: readonly (readonly [fore: ColorToken, back: ColorToken, minimum: number, what: string])[] = [
  ["text", "surface", 4.5, "body text"],
  ["mutedText", "surface", 4.5, "muted text"],
  ["labelText", "surface", 4.5, "field labels and table headings"],
  ["text", "subtle", 4.5, "assistant messages"],
  ["mutedText", "placeholder", 4.5, "a missing picture's alt text"],
  ["onAccent", "accent", 4.5, "primary buttons and user messages"],
  ["onAccent", "danger", 4.5, "danger buttons"],
  ["danger", "surface", 4.5, "a blocked action's message"],
  ["text", "accentSoft", 4.5, "info notices"],
  ["text", "successSoft", 4.5, "success notices"],
  ["text", "warningSoft", 4.5, "warning notices"],
  ["text", "dangerSoft", 4.5, "danger notices"],
  ["successText", "successSoft", 4.5, "success badges"],
  ["warningText", "warningSoft", 4.5, "warning badges"],
  ["dangerText", "dangerSoft", 4.5, "danger badges"],
  ["inputBorder", "surface", 3, "the edges of fields and switches"],
  ["accent", "surface", 3, "focus rings, an open tab, a switch that is on"],
  ["warning", "surface", 3, "rating stars"],
];
