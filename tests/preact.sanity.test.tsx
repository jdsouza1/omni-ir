// @vitest-environment jsdom
// Only in `npm run test:preact`: proves React's entry points really are Preact's there, so the
// renderer tests that run with it test the <omni-screen> build (PLAN-ELEMENTS.md, decision 1).
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as compat from "preact/compat";

describe("the Preact test run", () => {
  it("draws with Preact, not React", () => {
    expect(React.Component).toBe(compat.Component);
    expect(String(ReactDOMClient.createRoot)).not.toContain("ReactDOMRoot");
  });
});
