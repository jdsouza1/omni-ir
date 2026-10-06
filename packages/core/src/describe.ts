// Human-readable descriptions of the schema, shared by the system prompt (server/prompt.ts) and the
// generated sections of SPEC.md (scripts/spec.ts), so both always describe the same rules.
import { z } from "zod";
import { ASSET_NAME, COMPONENTS, ISO_DATE, type ComponentType } from "./schema.js";

export interface JsonSchema {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  maxLength?: number;
  minLength?: number;
  maxItems?: number;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
}

export interface PropShape {
  name: string;
  required: boolean;
  /** Its position when passed positionally (0-based), or null for named-only props. */
  position: number | null;
  /** Short form, as the model sees it: `"row" | "column"`, `text | $state`. */
  summary: string;
  /** With limits, as the spec states it: `text (max 2000) | $state`. */
  detail: string;
}

export interface ComponentShape {
  type: ComponentType;
  /** `Stack(children, [direction=…], [gap=…], [align=…])`: positional props bare, named ones `name=…`, optional ones in brackets. */
  signature: string;
  props: PropShape[];
}

export function describeComponent(type: ComponentType): ComponentShape {
  const spec = COMPONENTS[type];
  const schema = z.toJSONSchema(spec.props) as JsonSchema;
  const required = new Set(schema.required ?? []);
  const positional = spec.positional as readonly string[];
  const entries = Object.entries(schema.properties ?? {});
  const named = entries.map(([name]) => name).filter((name) => !positional.includes(name));
  // Positional props bare, the rest as `name=…` (they must be given by name); optional ones in
  // brackets: `Image(asset, alt=…, [ratio=…])`. A model check found `alt?`-style signatures were
  // read as "pass these in order".
  const arg = (n: string, byName: boolean) => {
    const bare = byName ? `${n}=…` : n;
    return required.has(n) ? bare : `[${bare}]`;
  };
  const signature = `${type}(${[...positional.map((n) => arg(n, false)), ...named.map((n) => arg(n, true))].join(", ")})`;
  return {
    type,
    signature,
    props: entries.map(([name, def]) => ({
      name,
      required: required.has(name),
      position: positional.includes(name) ? positional.indexOf(name) : null,
      summary: describeValue(def),
      detail: describeValue(def, true),
    })),
  };
}

export function describeValue(def: JsonSchema, detailed = false): string {
  if (def.anyOf) return def.anyOf.map((d) => describeValue(d, detailed)).join(" | ");
  if (def.const !== undefined) return JSON.stringify(def.const);
  if (def.enum) return def.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (def.type === "object" && def.properties?.kind?.const === "state") return "$state";
  if (def.type === "object" && def.properties?.kind?.const === "ref") return "id";
  if (def.type === "array") {
    const list = `[${describeValue(def.items ?? {}, detailed)}, …]`;
    return detailed && def.maxItems !== undefined ? `${list} (max ${def.maxItems})` : list;
  }
  if (def.type === "string") {
    if (def.format === "email") return "email address";
    if (def.pattern === "^[A-Z]{3}$") return "3-letter currency code";
    if (def.pattern === ISO_DATE.source) return 'date "YYYY-MM-DD"';
    if (def.pattern === ASSET_NAME.source) return detailed ? `image name (max ${def.maxLength})` : "image name";
    if (!detailed) return "text";
    const limits = [def.minLength ? `min ${def.minLength}` : "", def.maxLength ? `max ${def.maxLength}` : "", def.pattern ? `matching /${def.pattern}/` : ""]
      .filter(Boolean)
      .join(", ");
    return limits ? `text (${limits})` : "text";
  }
  if (def.type === "number" || def.type === "integer") {
    const kind = def.type === "integer" ? "whole number" : "number";
    if (def.exclusiveMinimum !== undefined) return `${kind} > ${def.exclusiveMinimum}`;
    if (def.minimum !== undefined && def.maximum !== undefined) return `${kind} ${def.minimum}-${def.maximum}`;
    return kind;
  }
  if (def.type === "boolean") return "true | false";
  return "value";
}
