// The two component libraries the screens use: Omni-IR's catalog (from its schema) and
// OpenUI's benchmark library (from OpenUI's published schema.json, pinned in sources/openui).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPONENTS, MCP_MUTATION, type ComponentType } from "@omni-ir/core";
import type { Catalog } from "./tree";

const BENCH = join(import.meta.dirname, "..");

function shapeKeys(schema: unknown): string[] {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) throw new Error("expected a Zod object schema");
  return Object.keys(shape);
}

export const OMNI_CATALOG: Catalog = {
  name: "Omni-IR",
  props(type) {
    if (type === "McpMutation") return shapeKeys(MCP_MUTATION.props);
    const entry = COMPONENTS[type as ComponentType];
    if (!entry) throw new Error(`not in Omni-IR's catalog: ${type}`);
    return shapeKeys(entry.props);
  },
  positional(type) {
    if (type === "McpMutation") return MCP_MUTATION.positional;
    return COMPONENTS[type as ComponentType].positional;
  },
  isLayout: (type) => type === "Stack" || type === "Card" || type === "List",
  isBinding: (type, prop) => (type === "Input" || type === "DateInput") && prop === "value",
};

interface JsonSchemaObject { properties?: Record<string, unknown> }
const openuiSchema = JSON.parse(readFileSync(join(BENCH, "sources/openui/schema.json"), "utf8")) as {
  $defs: Record<string, JsonSchemaObject>;
};

const OPENUI_LAYOUT = new Set(["Stack", "Card", "Form", "Buttons", "Tabs", "Accordion", "Carousel", "SwitchGroup", "Steps"]);

export const OPENUI_CATALOG: Catalog = {
  name: "OpenUI",
  props(type) {
    const def = openuiSchema.$defs[type];
    if (!def) throw new Error(`not in OpenUI's schema.json: ${type}`);
    return Object.keys(def.properties ?? {});
  },
  positional(type) {
    return this.props(type).slice(0, 1);
  },
  isLayout: (type) => OPENUI_LAYOUT.has(type),
  isBinding: () => false,
};

export const OPENUI_COMPONENT_TYPES = Object.keys(openuiSchema.$defs);
