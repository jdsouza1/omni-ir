// The reference server's system prompt: the one from @omni-ir/core, with the demo app's tools,
// pictures, components and live parts, and its fixtures as examples. Deterministic, so it can be
// prompt-cached.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ASSETS, type AssetRegistry } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { LIVE_PARTS } from "../app/live";
import { buildSystemPrompt as buildPrompt, type AppComponents, type PicturePattern, type ToolRegistry } from "@omni-ir/core";

export { patternLine } from "@omni-ir/core";

export interface PromptOptions {
  tools?: ToolRegistry;
  /** Images the model may name; defaults to the shared registry. */
  assets?: AssetRegistry;
  /** The app's own components (Step 20); defaults to the demo app's. */
  components?: AppComponents;
  /** Families of picture names the app looks up (Step 20); defaults to the demo app's. */
  pictures?: readonly PicturePattern[];
  /** Parts of a screen the app keeps current (Step 22), by id or $key; defaults to the demo app's. */
  live?: Readonly<Record<string, string>>;
  fixturesDir?: string;
  /** Fixture names used as examples, in order. */
  examples?: string[];
}

const DEFAULT_EXAMPLES = ["payment-confirmation", "sign-in", "order-status"];

export function buildSystemPrompt(options: PromptOptions = {}): string {
  const dir = options.fixturesDir ?? resolve("fixtures");
  const examples = (options.examples ?? DEFAULT_EXAMPLES).map((name) =>
    readFileSync(join(dir, `${name}.omni`), "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
      .trim(),
  );
  return buildPrompt({
    tools: options.tools ?? TOOLS,
    assets: options.assets ?? ASSETS,
    components: options.components ?? APP_COMPONENTS,
    pictures: options.pictures ?? PICTURES,
    live: options.live ?? LIVE_PARTS,
    examples,
  });
}

/** The Omni-IR text inside each <example> block of a prompt. */
export function examplesIn(prompt: string): string[] {
  return [...prompt.matchAll(/<example>\n([\s\S]*?)\n<\/example>/g)].map((m) => m[1]!);
}
