// The design tokens (packages/react/src/catalog/theme.ts) written where they are used:
// - the token block at the top of packages/react/src/catalog/omni.css (light, dark, and dark on a
//   dark device when the app chose "system");
// - conformance/theme.json, the language-neutral list the Swift and Kotlin catalogs generate from.
// Run: npm run theme (or -- --check). Tests fail if either is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { COLOR_TOKENS, CONTRAST_PAIRS, DARK, LIGHT, SHAPE, cssVariable, type Palette } from "../packages/react/src/catalog/theme";

const CSS_FILE = "packages/react/src/catalog/omni.css";
const JSON_FILE = "conformance/theme.json";
const BLOCK = /\/\* generated:theme \*\/[\s\S]*?\/\* \/generated:theme \*\//;

const declarations = (palette: Palette, indent: string) => COLOR_TOKENS.map((t) => `${indent}${cssVariable(t)}: ${palette[t]};`).join("\n");

/** The token block of omni.css. :where() keeps it at zero specificity, so an app's `.omni-root { --omni-accent: … }` always wins. */
export function themeCss(): string {
  return `/* generated:theme */
:where(.omni-root) {
${declarations(LIGHT, "  ")}
  ${cssVariable("font")}: ${SHAPE.font};
  ${cssVariable("radius")}: ${SHAPE.radius};
  color: var(--omni-text);
  font-family: var(--omni-font);
}
:where(.omni-root[data-theme="dark"]) {
${declarations(DARK, "  ")}
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :where(.omni-root[data-theme="system"]) {
${declarations(DARK, "    ")}
    color-scheme: dark;
  }
}
/* /generated:theme */`;
}

export function themeJson(): string {
  return (
    JSON.stringify(
      {
        description: "Omni-IR design tokens: the colours, font and corner radius a renderer draws with, set by the app, never by the stream. Colours are #rrggbb.",
        tokens: [...COLOR_TOKENS],
        light: LIGHT,
        dark: DARK,
        shape: { radius: Number.parseFloat(SHAPE.radius), radiusUnit: "px" },
        contrast: CONTRAST_PAIRS.map(([foreground, background, minimum, what]) => ({ foreground, background, minimum, what })),
      },
      null,
      2,
    ) + "\n"
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const check = process.argv.includes("--check");
  const css = readFileSync(CSS_FILE, "utf8");
  const nextCss = css.replace(BLOCK, themeCss());
  const stale = [css !== nextCss && CSS_FILE, readFileSync(JSON_FILE, { encoding: "utf8", flag: "a+" }) !== themeJson() && JSON_FILE].filter(Boolean);
  if (check) {
    if (stale.length) {
      console.error(`stale: ${stale.join(", ")} (run npm run theme)`);
      process.exit(1);
    }
    console.log("theme up to date");
  } else {
    writeFileSync(CSS_FILE, nextCss);
    writeFileSync(JSON_FILE, themeJson());
    console.log(`wrote ${CSS_FILE} (token block) and ${JSON_FILE}`);
  }
}
