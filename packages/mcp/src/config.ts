// What the view needs from the app, injected into its HTML when the server serves it: the tools'
// param schemas (as JSON Schema, rebuilt into Zod in the view for the first check before sending) and
// the pictures. The view has no network ([10.25]), so this is all it knows about the app.
import { z } from "zod";
import type { ToolRegistry } from "@omni-ir/core";
import { CONFIG_ELEMENT_ID, CONFIG_PLACEHOLDER } from "./constants.js";
import type { Picture } from "./guide.js";

export interface ViewConfig {
  tools: Record<string, unknown>;
  assets: Readonly<Record<string, Picture>>;
}

const BACKSLASH = String.fromCharCode(92);

export function viewConfig({ tools, assets }: { tools: ToolRegistry; assets: Readonly<Record<string, Picture>> }): ViewConfig {
  return {
    tools: Object.fromEntries(Object.entries(tools).map(([name, schema]) => [name, z.toJSONSchema(schema, { unrepresentable: "any" })])),
    assets,
  };
}

/**
 * The view's HTML with the configuration in a JSON script element. Every `<` is escaped, so nothing
 * in it (a picture's data, a tool's description) can close the element or start another.
 */
export function injectConfig(html: string, config: ViewConfig): string {
  if (!html.includes(CONFIG_PLACEHOLDER)) throw new Error(`The view's HTML has no ${CONFIG_PLACEHOLDER} placeholder`);
  // "<" can't close the element; U+2028 and U+2029 are escaped too, as JSON allows and old parsers need.
  const escape = (c: string) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
  const json = JSON.stringify(config)
    .replaceAll("<", escape)
    .replaceAll(String.fromCharCode(0x2028), escape)
    .replaceAll(String.fromCharCode(0x2029), escape);
  return html.replace(CONFIG_PLACEHOLDER, () => `<script type="application/json" id="${CONFIG_ELEMENT_ID}">${json}</script>`);
}
