// @vitest-environment jsdom
// Performance budgets (PLAN-HARDENING.md, C.3). Generous on purpose, so CI machines never flake:
// they fail only if parsing goes back to quadratic (20,000 components took 58 s before C.2, 0.4 s
// after) or rendering a stream slows down badly. Measurements: npx tsx scripts/perf.ts.
import { act, render } from "@testing-library/react";
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import { TOOLS } from "../app/tools";
import { screen, time } from "../scripts/perf";

describe("performance budgets", () => {
  // Since [5.25] a stream holds at most 1,000 components: the rest of a 20,000-line stream must be
  // rejected just as cheaply.
  it("parses a 20,000-line stream in under 5 seconds, keeping the first 1,000 components", () => {
    time(200); // warm up
    const result = time(20_000);
    expect(result.components).toBe(1_000);
    expect(result.issues).toBeGreaterThan(19_000);
    expect(result.totalMs).toBeLessThan(5_000);
  }, 60_000);

  it("streams and renders a 1,000-component screen in under 10 seconds", () => {
    const parser = createParser({ tools: TOOLS });
    const view = render(<OmniRenderer store={parser.store} tools={TOOLS} onMutation={() => {}} />);
    const start = performance.now();
    for (const line of screen(1_000)) act(() => parser.write(`${line}\n`));
    act(() => void parser.end());
    expect(performance.now() - start).toBeLessThan(10_000);
    expect(view.container.querySelectorAll("[data-node-id]").length).toBeGreaterThan(1_000);
  }, 60_000);
});
