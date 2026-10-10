// @vitest-environment jsdom
// The published <omni-screen> module itself (Step 21, PLAN-ELEMENTS.md C.1): built as `npm run
// elements:build` builds it, within its size budget (decision 8), with Preact and no React inside
// (decision 1), its styles made for a shadow root (decision 2), and drawing a screen when loaded.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildElements, ELEMENTS_BUDGET_BYTES, gzipSize } from "../scripts/elements-build";

let code = "";
let module: { ELEMENT_CSS: string; OmniScreenElement: typeof HTMLElement };

beforeAll(async () => {
  code = await buildElements();
  // Inside the project, where the test runner can load it.
  const dir = resolve("node_modules/.cache/omni-elements-test");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, "omni-elements.js");
  writeFileSync(file, code);
  module = await import(/* @vite-ignore */ file);
}, 120_000);

afterAll(() => {
  document.body.innerHTML = "";
});

describe("the built <omni-screen> module", () => {
  it(`stays within ${ELEMENTS_BUDGET_BYTES / 1024} KB compressed (decision 8)`, () => {
    expect(gzipSize(code)).toBeLessThanOrEqual(ELEMENTS_BUDGET_BYTES);
  });

  it("carries Preact, not React (decision 1)", () => {
    expect(code).not.toMatch(/ReactDOMRoot|__REACT_DEVTOOLS|unstable_scheduleCallback/);
    expect(code).toContain("Preact (MIT)");
  });

  it("puts the tokens' defaults on the host, so a page's omni-screen { --omni-… } wins (decision 2)", () => {
    expect(module.ELEMENT_CSS).not.toContain(":where(.omni-root");
    expect(module.ELEMENT_CSS).toContain(':host([theme="dark"])');
    expect(module.ELEMENT_CSS).toContain(':host([theme="system"])');
  });

  it("defines <omni-screen> and draws a screen", async () => {
    const el = document.createElement("omni-screen") as HTMLElement & { write(text: string): void; end(): void };
    expect(el).toBeInstanceOf(module.OmniScreenElement);
    document.body.append(el);
    el.write('root = Card([title])\ntitle = Heading("Hello from the bundle")\n');
    el.end();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(el.shadowRoot?.textContent).toContain("Hello from the bundle");
  });
});
