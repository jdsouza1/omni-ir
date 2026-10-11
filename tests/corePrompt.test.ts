// The system prompt builder published in @omni-ir/core (PLAN-QUICKSTART.md decision 7): usable in a
// browser and in any app, with the app's own registries, and the reference server's prompt unchanged.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { buildSystemPrompt, createParser, DEFAULT_PROMPT_EXAMPLES, type ParserEvent } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { LIVE_PARTS } from "../app/live";
import { TOOLS } from "../app/tools";
import { buildSystemPrompt as serverPrompt } from "../server/prompt";

const fixture = (name: string) =>
  readFileSync(`fixtures/${name}.omni`, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();

describe("buildSystemPrompt from @omni-ir/core", () => {
  it("gives the reference server's prompt when called with the demo app's registries", () => {
    const fromCore = buildSystemPrompt({
      tools: TOOLS,
      assets: ASSETS,
      components: APP_COMPONENTS,
      pictures: PICTURES,
      live: LIVE_PARTS,
      examples: ["payment-confirmation", "sign-in", "order-status"].map(fixture),
    });
    expect(fromCore).toBe(serverPrompt());
  });

  it("works with only an app's tools: no demo pictures, components or live parts", () => {
    const tools = { "orders.requestReturn": z.strictObject({ orderId: z.string() }) };
    const prompt = buildSystemPrompt({ tools });
    expect(prompt).toContain("- orders.requestReturn: params {orderId: text}");
    // The rules show `payments.confirm` as a worked example; the list of tools has only the app's.
    expect(prompt.split("## Tools\n")[1]!.split("\n\n")[0]).toBe("- orders.requestReturn: params {orderId: text}");
    expect(prompt).not.toContain("This app's components");
    expect(prompt).not.toContain("## Live parts");
    expect(prompt).toContain("(none: don't use Image)");
    for (const example of DEFAULT_PROMPT_EXAMPLES) expect(prompt).toContain(example);
  });

  it("ships default examples that are valid with no tools and no pictures", () => {
    expect(DEFAULT_PROMPT_EXAMPLES.length).toBeGreaterThan(0);
    for (const example of DEFAULT_PROMPT_EXAMPLES) {
      const parser = createParser({ tools: {} });
      const issues: string[] = [];
      parser.subscribe((e: ParserEvent) => {
        if (e.type === "end") issues.push(...e.issues.map((i) => `${i.code}: ${i.message}`));
      });
      parser.write(example + "\n");
      parser.end();
      expect(issues).toEqual([]);
    }
  });

  it("needs nothing from Node, so a browser can build it", () => {
    const source = readFileSync("packages/core/src/prompt.ts", "utf8");
    expect(source).not.toMatch(/from "node:|require\(/);
  });
});
