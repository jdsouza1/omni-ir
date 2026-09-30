// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { TOOLS } from "../app/tools";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const screens = [
  ...readdirSync("fixtures").filter((f) => f.endsWith(".omni")),
  ...readdirSync("fixtures/landing")
    .filter((f) => f.endsWith(".omni"))
    .map((f) => `landing/${f}`), // the landing page examples
];

describe.each(screens)("%s renders", (name) => {
  it("with no placeholders, fallbacks or renderer errors, and every action governed by a registered tool", () => {
    const lines = readFileSync(resolve("fixtures", name), "utf8").split("\n");
    const h = renderOmni({ lines });
    h.end();
    expect(h.container.querySelector("[data-pending-id]")).toBeNull();
    expect(h.container.querySelector("[data-fallback-reason]")).toBeNull();
    expect(h.errors()).toEqual([]);

    for (const button of h.container.querySelectorAll("button")) {
      const tool = button.getAttribute("data-mcp-tool");
      if (tool !== null) {
        expect(Object.keys(TOOLS)).toContain(tool);
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    }
  });
});
