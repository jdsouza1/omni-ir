// What the view needs from the app, injected into its HTML when the server serves it: the tools'
// param schemas (as JSON Schema, rebuilt into Zod in the view for the first check before sending) and
// the pictures. The view has no network ([10.25]), so this is all it knows about the app.
import { z } from "zod";
import { componentDeclarations, type AppComponentDeclaration, type AppComponents, type PicturePattern, type ToolRegistry } from "@omni-ir/core";
import { CONFIG_ELEMENT_ID, CONFIG_PLACEHOLDER } from "./constants.js";
import type { Picture } from "./guide.js";

export interface ViewConfig {
  tools: Record<string, unknown>;
  assets: Readonly<Record<string, Picture>>;
  /** The app's own components, as plain-JSON declarations (Step 20), so the view's parser accepts them. */
  components?: Record<string, AppComponentDeclaration>;
  /** Families of picture names (Step 20). */
  pictures?: readonly PicturePattern[];
}

const BACKSLASH = String.fromCharCode(92);

export function viewConfig({
  tools,
  assets,
  components,
  pictures,
}: {
  tools: ToolRegistry;
  assets: Readonly<Record<string, Picture>>;
  components?: AppComponents;
  pictures?: readonly PicturePattern[];
}): ViewConfig {
  return {
    tools: Object.fromEntries(Object.entries(tools).map(([name, schema]) => [name, z.toJSONSchema(schema, { unrepresentable: "any" })])),
    assets,
    ...(components !== undefined && Object.keys(components).length > 0 ? { components: componentDeclarations(components) } : {}),
    ...(pictures !== undefined && pictures.length > 0 ? { pictures } : {}),
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
