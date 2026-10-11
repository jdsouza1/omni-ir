// @vitest-environment jsdom
// The demo video's screens (PLAN-VIDEO.md): what each scene claims is true of the real renderer.
import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createParser } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

describe("scene 5: the AI can ask, your app decides", () => {
  const text = readFileSync("fixtures/variants/delete-account.omni", "utf8");

  it("rejects the McpMutation for a tool the app never registered", () => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    const codes: string[] = [];
    parser.subscribe((e) => e.type === "error" && codes.push(e.issue.code));
    parser.write(text);
    parser.end();
    expect(codes).toContain("unknown_tool");
    expect(parser.getSnapshot().mutations.size).toBe(0);
  });

  it("draws the delete button, disabled: pressing it can't reach the server", () => {
    const h = renderOmni({ lines: text.split("\n") });
    h.end();
    const button = screen.getByRole("button", { name: "Delete my account" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(h.onMutation).not.toHaveBeenCalled();
  });
});
