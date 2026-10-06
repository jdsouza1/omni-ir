// @vitest-environment jsdom
// Design tokens and the web themes (PLAN-THEMES.md A-B): one list of tokens, contrast in light and
// dark, omni.css drawing only with the tokens, the light theme keeping the original look, and the
// theme chosen by the app through OmniRenderer, never by the stream.
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { createParser } from "@omni-ir/core";
import { COLOR_TOKENS, CONTRAST_PAIRS, DARK, LIGHT, OmniRenderer, contrast, cssVariable } from "@omni-ir/react";
import { TOOLS } from "../app/tools";
import { themeCss, themeJson } from "../scripts/theme";

afterEach(cleanup);
const css = readFileSync("packages/react/src/catalog/omni.css", "utf8");
const BLOCK = /\/\* generated:theme \*\/[\s\S]*?\/\* \/generated:theme \*\//;

describe("the token list", () => {
  it("gives every token a #rrggbb value in light and dark", () => {
    for (const palette of [LIGHT, DARK]) {
      expect(Object.keys(palette).sort()).toEqual([...COLOR_TOKENS].sort());
      for (const token of COLOR_TOKENS) expect(palette[token], token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("meets WCAG AA contrast for every pair a reader depends on (%s)", (_, palette) => {
    for (const [fore, back, minimum, what] of CONTRAST_PAIRS) {
      expect(contrast(palette[fore], palette[back]), `${what}: ${fore} on ${back}`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("writes conformance/theme.json for other renderers (run npm run theme if this fails)", () => {
    expect(readFileSync("conformance/theme.json", "utf8")).toBe(themeJson());
  });
});

describe("omni.css", () => {
  it("defines the tokens from the list (run npm run theme if this fails)", () => {
    expect(css.match(BLOCK)?.[0]).toBe(themeCss());
  });

  it("draws only with the tokens: no colour written outside the token block", () => {
    const rules = css.replace(BLOCK, "");
    expect(rules.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    const used = new Set([...rules.matchAll(/var\((--omni-[a-z0-9-]+)\)/g)].map((m) => m[1]!));
    const defined = new Set([...COLOR_TOKENS, "font", "radius"].map((t) => cssVariable(t as never)));
    expect([...used].filter((v) => !defined.has(v)), "variables used but not defined").toEqual([]);
  });

  it("keeps the original look in the light theme (only the input border is darker, for contrast)", () => {
    /** A rule's declaration with the light values filled in. */
    const resolved = (selector: string, property: string) => {
      const rule = new RegExp(`(^|\\n)${selector.replace(/[.[\]"=-]/g, "\\$&")} \\{([^}]*)\\}`).exec(css);
      const value = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(rule?.[2] ?? "")?.[1]?.trim() ?? "";
      return value.replace(/var\((--omni-[a-z0-9-]+)\)/g, (_, name: string) => {
        const token = COLOR_TOKENS.find((t) => cssVariable(t) === name);
        return token ? LIGHT[token] : name;
      });
    };
    expect(resolved(".omni-card", "background")).toBe("#ffffff");
    expect(resolved(".omni-card", "border")).toBe("1px solid #d9dce1");
    expect(resolved(".omni-text--muted", "color")).toBe("#5b616e");
    expect(resolved(".omni-button--primary", "background")).toBe("#1f5eff");
    expect(resolved(".omni-button--danger", "background")).toBe("#c62828");
    expect(resolved(".omni-badge--warning", "color")).toBe("#7a5200");
    expect(resolved(".omni-notice--success", "background")).toBe("#e3f4e6");
    expect(resolved(".omni-message--assistant", "background")).toBe("#eef0f3");
    expect(resolved(".omni-input__field", "border")).toBe("1px solid #868c97");
  });

  it("uses direction-neutral sides (start and end), so right-to-left layouts mirror", () => {
    expect(css.replace(BLOCK, "").match(/(margin|padding|border)-(left|right)\b|\b(left|right):\s/g) ?? []).toEqual([]);
  });

  it("has dark values for a dark theme and for a system theme on a dark device", () => {
    expect(css).toContain('.omni-root[data-theme="dark"]');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:where\(\.omni-root\[data-theme="system"\]\)/);
  });
});

describe("OmniRenderer's theme", () => {
  const show = (theme?: "light" | "dark" | "system") => {
    const parser = createParser({ tools: TOOLS });
    parser.write('root = Text("Hi")\n');
    const { container } = render(<OmniRenderer store={parser.store} tools={TOOLS} onMutation={() => {}} {...(theme ? { theme } : {})} />);
    return container.querySelector(".omni-root")!;
  };

  it("is light unless the app asks for dark or the device's setting", () => {
    expect(show().getAttribute("data-theme")).toBe("light");
    expect(show("dark").getAttribute("data-theme")).toBe("dark");
    expect(show("system").getAttribute("data-theme")).toBe("system");
  });

  it("can't be set from the stream: a theme or style prop is rejected", () => {
    const parser = createParser({ tools: TOOLS });
    const codes: string[] = [];
    parser.subscribe((e) => e.type === "error" && codes.push(e.issue.code));
    parser.write('root = Card([t], theme="dark")\nt = Text("x", style="color: red")\n');
    expect(codes).toEqual(["invalid_props", "invalid_props"]);
  });
});
